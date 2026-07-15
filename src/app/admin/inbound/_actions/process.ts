"use server";

import { revalidatePath } from "next/cache";
import { getTranslations, getLocale } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import { parseExtraction } from "@/lib/inbound/extraction";
import { extractInbound } from "@/lib/inbound/extract";
import { matchInbound } from "@/lib/inbound/match";
import { loadInboundSettings } from "@/lib/inbound/settings";

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
 * Harness ingress for Slice C: save a transcript / message body so extraction
 * (and, before B ships, the whole C→D→E path) can be exercised on hand-typed
 * text. Writes `body_text` + status `understood`. When the transcription stage
 * (B) ships it writes this same column and this editor becomes a debugging
 * override. Clearing the text drops back to `received`.
 */
export async function saveBodyText(
  messageId: string,
  text: string,
): Promise<ProcessResult> {
  const t = await getTranslations("errors");
  const body = text.trim();

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inbound_messages")
    .update({
      body_text: body || null,
      status: body ? "understood" : "received",
    })
    .eq("id", messageId);
  if (error) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: error.message }) };
  }
  revalidatePath(`/admin/inbound/${messageId}`);
  return { ok: true };
}

/**
 * Extraction stage (Slice C): run the selected extraction provider over the
 * message's `body_text`, store the structured `extraction`, advance to
 * `extracted`, and clear any prior match (same reset as editing extraction by
 * hand). Guards on body present + provider secret present, mapping the lib's
 * typed failure reasons to localized messages.
 */
export async function runExtraction(messageId: string): Promise<ProcessResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();

  const { data: msg, error: loadErr } = await supabase
    .from("inbound_messages")
    .select("id, body_text")
    .eq("id", messageId)
    .maybeSingle();
  if (loadErr) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: loadErr.message }) };
  }
  if (!msg) return { ok: false, error: t("missingId") };

  const settings = await loadInboundSettings(supabase);
  const result = await extractInbound(msg.body_text, {
    provider: settings.extractionProvider,
    model: settings.extractionModel,
  });
  if (!result.ok) {
    switch (result.reason) {
      case "no_body":
        return { ok: false, error: t("inboundNoBody") };
      case "no_key":
        return { ok: false, error: t("inboundExtractionKeyMissing") };
      case "unknown_provider":
        return {
          ok: false,
          error: t("inboundUnknownProvider", { provider: result.detail ?? "" }),
        };
      default:
        return {
          ok: false,
          error: t("inboundExtractionFailed", {
            detail: result.detail || t("inboundNoDetails"),
          }),
        };
    }
  }

  const { error: saveErr } = await supabase
    .from("inbound_messages")
    .update({
      extraction: result.extraction,
      status: "extracted",
      match_candidates: null,
      matched_organization_id: null,
      matched_contact_id: null,
      matched_bike_id: null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", messageId);
  if (saveErr) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: saveErr.message }) };
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
