"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";

export type SaveCallerResult = { ok: true } | { ok: false; error: string };

/**
 * The learning loop (triage layer 5, highest-leverage): a reviewer links an
 * unknown caller's number to a contact — new or existing — so every FUTURE
 * call from that number matches at the top tier (phone → contact → org), and
 * the triage trump card (a known number is never spam) starts protecting it.
 * Every human review permanently improves the machine; no ML.
 *
 * The number is stored verbatim on the contact; the matcher normalizes to the
 * last 8 digits, so formatting doesn't matter. This message is linked
 * immediately too (matched_contact_id), so the payoff is visible at once.
 */
export async function saveCallerToContact(
  messageId: string,
  target: { kind: "existing"; contactId: string } | { kind: "new"; name: string },
): Promise<SaveCallerResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();

  const { data: msg, error: loadErr } = await supabase
    .from("inbound_messages")
    .select("id, from_identity, matched_organization_id")
    .eq("id", messageId)
    .maybeSingle();
  if (loadErr) {
    return { ok: false, error: t("couldNotSave", { detail: loadErr.message }) };
  }
  if (!msg) return { ok: false, error: t("missingId") };
  const phone = (msg.from_identity ?? "").trim();
  if (!phone) return { ok: false, error: t("inboundNoCaller") };

  let contactId: string;
  let orgId = msg.matched_organization_id as string | null;

  if (target.kind === "existing") {
    contactId = target.contactId;
    const { data: updated, error } = await supabase
      .from("contacts")
      .update({ phone })
      .eq("id", contactId)
      .select("organization_id")
      .maybeSingle();
    if (error || !updated) {
      return { ok: false, error: t("couldNotSave", { detail: error?.message ?? "" }) };
    }
    orgId = updated.organization_id;
  } else {
    if (!orgId) return { ok: false, error: t("inboundNoOrgForContact") };
    const name = target.name.trim();
    if (!name) return { ok: false, error: t("inboundNoContactName") };
    const [first, ...rest] = name.split(/\s+/);
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({
        organization_id: orgId,
        phone,
        first_name: first || null,
        last_name: rest.join(" ") || null,
        is_primary: false,
      })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: t("couldNotSave", { detail: error?.message ?? "" }) };
    }
    contactId = created.id;
  }

  // Link this message to the contact (and its org) — the loop's payoff, now.
  const { error: linkErr } = await supabase
    .from("inbound_messages")
    .update({ matched_contact_id: contactId, matched_organization_id: orgId })
    .eq("id", messageId);
  if (linkErr) {
    return { ok: false, error: t("couldNotSave", { detail: linkErr.message }) };
  }

  revalidatePath(`/inbox/${messageId}`);
  revalidatePath("/inbox");
  return { ok: true };
}
