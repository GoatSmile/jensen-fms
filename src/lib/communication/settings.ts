/**
 * Owner-configurable communication settings (migration 55) — the single
 * read path for every outbound channel: the PO-to-supplier email (Tier 3)
 * and, later, the phone-call → ticket pipeline (SMS acks, call routing).
 * Edited at /admin/settings; nothing here comes from env vars.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunicationSettings = {
  /** Sender for app-generated mail; must be on the provider-verified domain. */
  fromEmail: string | null;
  /** Reply-to — typically the owner's real inbox. */
  replyToEmail: string | null;
  /**
   * While true, ALL outbound mail is rerouted to `testEmails` instead of the
   * real recipients. Ships on; flipping it off in admin is the go-live switch.
   */
  testMode: boolean;
  /** Parsed from the comma-separated admin field. */
  testEmails: string[];
  /** The shop's phone number (documents now, call pipeline later). */
  workshopPhone: string | null;
};

export async function loadCommunicationSettings(
  supabase: SupabaseClient,
): Promise<CommunicationSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select(
      "outbound_from_email, outbound_reply_to_email, outbound_test_mode, outbound_test_email, workshop_phone",
    )
    .eq("id", 1)
    .maybeSingle();
  return {
    fromEmail: data?.outbound_from_email ?? null,
    replyToEmail: data?.outbound_reply_to_email ?? null,
    testMode: Boolean(data?.outbound_test_mode ?? true),
    testEmails: parseEmailList(data?.outbound_test_email ?? null),
    workshopPhone: data?.workshop_phone ?? null,
  };
}

/** "a@x.dk, b@y.com" → ["a@x.dk", "b@y.com"]; junk-tolerant. */
export function parseEmailList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

/**
 * The recipients an outbound email should ACTUALLY go to. In test mode the
 * real recipients are swapped for the test inboxes (returned separately so
 * the caller can label the mail "test — would have gone to X").
 */
export function resolveRecipients(
  settings: CommunicationSettings,
  realRecipients: string[],
):
  | { ok: true; to: string[]; testMode: boolean; intended: string[] }
  | { ok: false; error: string } {
  if (settings.testMode) {
    if (settings.testEmails.length === 0) {
      return {
        ok: false,
        error:
          "Test mode is on but no test email is configured — set one under Admin → Settings → Communication.",
      };
    }
    return {
      ok: true,
      to: settings.testEmails,
      testMode: true,
      intended: realRecipients,
    };
  }
  if (realRecipients.length === 0) {
    return { ok: false, error: "No recipient email on file." };
  }
  return { ok: true, to: realRecipients, testMode: false, intended: realRecipients };
}
