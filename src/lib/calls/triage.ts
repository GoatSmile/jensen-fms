/**
 * Which calls need something from a person — the Calls page's four groups.
 *
 * DERIVED, never stored (the "at painter" rule): re-running extraction or
 * matching moves a call to the right group without a migration of state, and
 * the only stored input a person controls is `disposition`, which wins.
 * Pure and deterministic — the model reads the call, but these rules, not the
 * model, decide what a human must do, and every result carries the REASON the
 * page prints, so a grey row can always answer "why is this grey?".
 *
 * Order matters and is the whole design:
 *   1. a person's decision (ticket, handled, spam, "needs action") wins —
 *      except that SUGGESTED actions nobody has applied keep a call in to do
 *      even once one of them (a ticket) has been applied; an OPTIONAL one (a
 *      call's repair ticket, `isOptionalOnCall`) is never counted;
 *   2. the system's own trouble (failed, still processing) is a CHECK;
 *      a call nobody recorded is judged by what happened — a MISSED call
 *      is someone to ring back, an answered one was dealt with live;
 *   3. a PROMISE the workshop made is never quiet — forgotten promises cost most;
 *   4. a voicemail is someone waiting for a call back;
 *   5. a request is TO DO — or CHECK when we are not sure who or what it was;
 *   6. everything else (between our own people, short, no speech, spam-looking,
 *      chit-chat) is quiet.
 *
 * WHAT WAS SAID decides, never whose number it came from: a colleague relaying
 * a customer's order, or the owner testing from their own mobile, is as much
 * work as the customer ringing directly. "Internal" only explains why a call
 * with nothing in it is quiet; the page tags internal calls separately, in
 * every group (owner, 2026-09-30).
 */
import type { InboundExtraction } from "@/lib/inbound/extraction";
import { isSuspectedSpam } from "@/lib/inbound/triage";

export type CallLane = "todo" | "check" | "quiet" | "done";

export type CallReason =
  // done
  | "ticketed"
  | "handled"
  // todo
  | "suggested"
  | "marked_needs_action"
  | "promise"
  | "callback"
  | "missed"
  | "request"
  | "note"
  // check
  | "failed"
  | "processing"
  | "which_customer"
  | "unclear"
  // quiet
  | "spam"
  | "internal"
  | "not_recorded"
  | "no_speech"
  | "no_request";

export type CallTriage = {
  lane: CallLane;
  reason: CallReason;
  /** Only ever set in `todo`: the customer said it was urgent. Drives `alert`. */
  urgent: boolean;
};

export type TriageInput = {
  channel: string;
  status: string;
  /** The pipeline's failure code, e.g. "transcribe.empty". */
  error: string | null;
  /** `answered_unrecorded`, `no-answer`, `message_left`, … — null on typed rows. */
  call_outcome: string | null;
  /** A recording is stored for this row. */
  has_media: boolean;
  /** Suggested actions on the call that nobody has applied yet. */
  open_suggestions: number;
  disposition: string | null;
  ticket_id: string | null;
  body_text: string | null;
  duration_seconds: number | null;
  transcript_confidence: number | null;
  spam_signals: unknown;
  matched_organization_id: string | null;
  match_candidates: unknown;
  extraction: InboundExtraction | null;
  /** The other party is one of our own lines or people (resolved by the caller). */
  internal: boolean;
  /** Minutes since the call arrived — tells "still reading" from "got stuck". */
  ageMinutes: number;
};

/** Outcomes that mean the call rang and nobody picked up. */
const MISSED_OUTCOMES = new Set(["no-answer", "busy"]);

/** Below this many seconds with little said, a call carries nothing to act on. */
const SHORT_SECONDS = 10;
/** A transcript this short is a greeting, a hang-up or silence. */
const MIN_SPEECH_CHARS = 25;
/** Clarity under this and the reading cannot be trusted without a listen. */
const UNCLEAR_CLARITY = 0.45;
/** A pipeline still running after this long has stopped — offer the retry. */
const STUCK_MINUTES = 30;

function orgCandidateCount(candidates: unknown): number {
  const c = candidates as { organizations?: unknown[] } | null;
  return Array.isArray(c?.organizations) ? c.organizations.length : 0;
}

export function triageCall(row: TriageInput): CallTriage {
  const x = row.extraction;
  const quiet = (reason: CallReason): CallTriage => ({ lane: "quiet", reason, urgent: false });
  const check = (reason: CallReason): CallTriage => ({ lane: "check", reason, urgent: false });
  const todo = (reason: CallReason): CallTriage => ({
    lane: "todo",
    reason,
    urgent: x?.urgency === "high",
  });

  // 1 · A person has decided.
  if (row.disposition === "handled") return { lane: "done", reason: "handled", urgent: false };
  if (row.disposition === "spam") return quiet("spam");
  if (row.open_suggestions > 0) return todo("suggested");
  if (row.ticket_id) return { lane: "done", reason: "ticketed", urgent: false };
  if (row.disposition === "needs_action") return todo("marked_needs_action");

  // 1b · A spoken NOTE is its speaker's to-do until someone closes it
  // (plan-inbox-notes.md) — only the system's own trouble reading it differs.
  if (row.channel === "note") {
    if (row.status === "failed" && (row.error ?? "").startsWith("transcribe.empty")) return quiet("no_speech");
    if (row.status === "failed") return check("failed");
    if (row.status === "received") return check(row.ageMinutes > STUCK_MINUTES ? "failed" : "processing");
    return todo("note");
  }

  // 2 · The system could not finish reading it.
  // A recording with no speech in it (a hang-up after the beep) is not a
  // failure to retry — the engine heard nothing because nothing was said.
  if (row.status === "failed" && (row.error ?? "").startsWith("transcribe.empty")) {
    return quiet("no_speech");
  }
  if (row.status === "failed") return check("failed");
  if (row.status === "received" || row.status === "understood") {
    return check(row.ageMinutes > STUCK_MINUTES ? "failed" : "processing");
  }

  // 2b · Nothing was recorded, so what HAPPENED is all there is to go on.
  // A missed call from a new number is not spam here: new customers ring from
  // unknown numbers, and a person can still say "no action needed".
  const said = (row.body_text ?? "").trim();
  if (!row.has_media && !said && row.call_outcome) {
    if (row.call_outcome === "answered_unrecorded") return quiet("not_recorded");
    if (MISSED_OUTCOMES.has(row.call_outcome)) {
      return row.internal ? quiet("internal") : todo("missed");
    }
  }

  // 3 · Something was promised to a customer.
  if ((x?.commitments ?? []).length > 0) return todo("promise");

  const barelySpoken =
    said.length < MIN_SPEECH_CHARS ||
    (row.duration_seconds != null && row.duration_seconds < SHORT_SECONDS && said.length < 80);

  // 4 · Someone left a message and is waiting.
  if (row.channel === "voicemail" && !barelySpoken) return todo("callback");

  // 5 · A request — do we know enough to act on it?
  const isRequest = x?.intent === "repair_request" || x?.intent === "order_inquiry";
  if (isRequest) {
    if (!row.matched_organization_id && orgCandidateCount(row.match_candidates) >= 2) {
      return check("which_customer");
    }
    if (
      x?.confidence === "low" &&
      row.transcript_confidence != null &&
      row.transcript_confidence < UNCLEAR_CLARITY
    ) {
      return check("unclear");
    }
    return todo("request");
  }

  // 6 · Nothing to act on.
  if (row.internal) return quiet("internal");
  if (row.disposition !== "not_spam" && isSuspectedSpam(row.spam_signals)) return quiet("spam");
  if (barelySpoken) return quiet("no_speech");
  return quiet("no_request");
}

/** Lane order on the page and in counts. */
export const LANE_ORDER: CallLane[] = ["todo", "check", "done", "quiet"];

/** Does this lane leave work for a person? A day holding any stays open. */
export function isOpenLane(lane: CallLane): boolean {
  return lane === "todo" || lane === "check";
}
