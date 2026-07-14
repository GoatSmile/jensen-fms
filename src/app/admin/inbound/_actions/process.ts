"use server";

import { revalidatePath } from "next/cache";
import { getTranslations, getLocale } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import { parseExtraction } from "@/lib/inbound/extraction";
import { matchInbound } from "@/lib/inbound/match";

export type ProcessResult = { ok: true } | { ok: false; error: string };

/**
 * Harness ingress for Slice D: paste/edit the extraction JSON so matching can
 * be exercised before the extraction stage (C) exists. Editing extraction
 * invalidates any prior match (clears candidates + attachments, drops status
 * back to `extracted`). When C ships it writes this same column and the
 * editor becomes a debugging override.
 */
export async function saveExtraction(
  messageId: string,
  jsonText: string,
): Promise<ProcessResult> {
  const t = await getTranslations("errors");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: t("inboundBadJson") };
  }
  const extraction = parseExtraction(parsed);

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inbound_messages")
    .update({
      extraction,
      status: "extracted",
      match_candidates: null,
      matched_organization_id: null,
      matched_contact_id: null,
      matched_bike_id: null,
    })
    .eq("id", messageId);
  if (error) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: error.message }) };
  }
  revalidatePath(`/admin/inbound/${messageId}`);
  return { ok: true };
}

/**
 * Run the deterministic matcher over the message's extraction + sender
 * identity, store candidates + any exactly-one attachments, advance to
 * `matched`. Deterministic code — no model, no external keys.
 */
export async function runMatch(messageId: string): Promise<ProcessResult> {
  const t = await getTranslations("errors");
  const locale = await getLocale();
  const supabase = createServiceClient();

  const { data: msg, error: loadErr } = await supabase
    .from("inbound_messages")
    .select("id, from_identity, extraction")
    .eq("id", messageId)
    .maybeSingle();
  if (loadErr) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: loadErr.message }) };
  }
  if (!msg) return { ok: false, error: t("missingId") };
  if (!msg.extraction) {
    return { ok: false, error: t("inboundNoExtraction") };
  }

  const result = await matchInbound(
    supabase,
    {
      fromIdentity: msg.from_identity,
      extraction: parseExtraction(msg.extraction),
    },
    locale,
  );

  const { error: saveErr } = await supabase
    .from("inbound_messages")
    .update({
      match_candidates: result.candidates,
      matched_organization_id: result.matchedOrganizationId,
      matched_contact_id: result.matchedContactId,
      matched_bike_id: result.matchedBikeId,
      status: "matched",
      processed_at: new Date().toISOString(),
    })
    .eq("id", messageId);
  if (saveErr) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: saveErr.message }) };
  }
  revalidatePath(`/admin/inbound/${messageId}`);
  return { ok: true };
}
