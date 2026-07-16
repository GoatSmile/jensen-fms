/**
 * Inbound triage (layer 5) — spam scoring + the fold rule. Channel-blind.
 *
 * Two halves:
 *  - `applyTriage` (server, queries) computes the deterministic, explainable
 *    `spam_signals` for a message and stores them. The trump card lives here:
 *    a number that matches a known contact is NEVER spam.
 *  - `isSuspectedSpam` / `isSpamFolded` (pure) drive the UI — the review queue
 *    derives the collapsed spam fold from the stored signals + the human
 *    `disposition`, so re-scoring never clobbers a human decision.
 *
 * Nothing is discarded: suspected spam is parked, reversible. The model never
 * decides — spam is boring, explainable signals a reviewer can see and undo.
 * See docs/plan-inbound-triage.md (layer 5).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type SpamSignal =
  | "unknown_number"
  | "no_message"
  | "short_call"
  | "repeat_unknown"
  | "no_caller_id";

const SHORT_CALL_SECONDS = 8;
const REPEAT_THRESHOLD = 3;

/**
 * A message looks like spam when it's from an unknown number AND shows a
 * low-value tell (no message left, a very short call, or a repeat dialer).
 * A proper voicemail from a first-time (unknown) caller is NOT spam — the
 * extra tells are what separate a robocall from a real new customer.
 */
export function isSuspectedSpam(signals: unknown): boolean {
  if (!Array.isArray(signals)) return false;
  const s = signals as string[];
  if (!s.includes("unknown_number")) return false;
  return (
    s.includes("no_message") ||
    s.includes("short_call") ||
    s.includes("repeat_unknown")
  );
}

/**
 * Whether a row belongs in the collapsed spam fold. Human disposition wins;
 * a ticketed message is never folded; otherwise fall back to the signals.
 */
export function isSpamFolded(row: {
  disposition: string | null;
  spam_signals: unknown;
  ticket_id: string | null;
}): boolean {
  if (row.disposition === "spam") return true;
  if (row.disposition === "not_spam") return false;
  if (row.ticket_id) return false;
  return isSuspectedSpam(row.spam_signals);
}

function normalizeDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Trump card: does any active contact carry this phone number? */
async function isKnownContactPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const target = normalizeDigits(phone);
  if (target.length < 6) return false;
  const tail = target.slice(-8);
  const { data } = await supabase
    .from("contacts")
    .select("phone")
    .not("phone", "is", null)
    .is("deleted_at", null)
    .limit(2000);
  return (data ?? []).some((c) => {
    const p = normalizeDigits((c.phone as string | null) ?? "");
    return p.length >= 6 && (p.endsWith(tail) || target.endsWith(p.slice(-8)));
  });
}

/**
 * Compute + store `spam_signals` for a message. Idempotent, safe to re-run;
 * writes only `spam_signals` (never `disposition` — that's the human's).
 */
export async function applyTriage(
  supabase: SupabaseClient,
  messageId: string,
): Promise<void> {
  const { data: row } = await supabase
    .from("inbound_messages")
    .select(
      "id, from_identity, call_outcome, duration_seconds, body_text, media_path, matched_contact_id, matched_organization_id",
    )
    .eq("id", messageId)
    .maybeSingle();
  if (!row) return;

  const from = (row.from_identity ?? "").trim();

  // Trump card: matched by the pipeline, or a contact carries this number.
  let known = Boolean(row.matched_contact_id || row.matched_organization_id);
  if (!known && from) known = await isKnownContactPhone(supabase, from);

  // A known caller is never spam — store no signals so it can't be folded.
  if (known) {
    await supabase
      .from("inbound_messages")
      .update({ spam_signals: [] })
      .eq("id", messageId);
    return;
  }

  const signals: SpamSignal[] = [];
  if (!from) signals.push("no_caller_id");
  else signals.push("unknown_number");

  const contentless = !row.body_text && !row.media_path;
  if (contentless) signals.push("no_message");
  if (row.duration_seconds != null && row.duration_seconds < SHORT_CALL_SECONDS) {
    signals.push("short_call");
  }

  if (from) {
    const { count } = await supabase
      .from("inbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("from_identity", from);
    if ((count ?? 0) >= REPEAT_THRESHOLD) signals.push("repeat_unknown");
  }

  await supabase
    .from("inbound_messages")
    .update({ spam_signals: signals })
    .eq("id", messageId);
}
