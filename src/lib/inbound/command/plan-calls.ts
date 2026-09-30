/**
 * Suggested actions for a customer's call, drafted BY THEMSELVES (owner,
 * 2026-09-30: "the system determines to-dos and actions to take … creates
 * pre-filled action items; the user acts on those suggestions").
 *
 * `planCall` phrases the call as a staff task (inquiry.ts) and hands it to the
 * command agent, storing only `command_plan` — the row's status, error and
 * processed_at belong to transcribe → extract → match. `draftSuggestions` is
 * the pass the import job runs every five minutes: calls that have been read
 * and carry a request get a plan ONCE (`plan_attempted_at`, migration 116).
 *
 * Proposing is not acting: every suggestion is applied by a person on the
 * call's page, so this stays inside "the model proposes, a person disposes"
 * and is not the auto-actions the triage plan holds back (DECISIONS
 * 2026-09-30).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseExtraction } from "../extraction";
import { loadInboundSettings } from "../settings";
import { runCommandAgent } from "./agent";
import { buildInquiryTask } from "./inquiry";

export type PlanCallResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "no_body" | "locked" | "agent" | "save"; detail?: string };

/** Calls older than this are not planned by the pass — only a person asks. */
const LOOKBACK_DAYS = 7;
/** Calls planned per run. Each is a multi-turn agent loop (~20–60 s), side by side. */
const MAX_PER_RUN = 3;
/** Below this a voicemail is a greeting or a hang-up, not a request. */
const MIN_SPEECH_CHARS = 25;

/** Today on the DANISH calendar — "this Friday" is relative to Copenhagen, not UTC. */
function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());
}

/** Run the agent on one call and store the plan. No access check — callers do that. */
export async function planCall(
  supabase: SupabaseClient,
  messageId: string,
): Promise<PlanCallResult> {
  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, kind, body_text, extraction, transcript_confidence, from_identity")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.kind === "command") return { ok: false, reason: "not_found" };
  if (!msg.body_text?.trim()) return { ok: false, reason: "no_body" };

  // Plan action ids are positional: re-planning after an apply would repoint
  // existing command_actions rows at different actions and corrupt provenance.
  const { count } = await supabase
    .from("command_actions")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId);
  if ((count ?? 0) > 0) return { ok: false, reason: "locked" };

  const clarity = msg.transcript_confidence === null ? null : Number(msg.transcript_confidence);
  const task = buildInquiryTask({
    transcript: msg.body_text,
    extraction: parseExtraction(msg.extraction),
    clarity: clarity !== null && Number.isFinite(clarity) ? clarity : null,
    fromIdentity: msg.from_identity,
  });

  const settings = await loadInboundSettings(supabase);
  const result = await runCommandAgent(supabase, task, {
    model: settings.extractionModel,
    today: today(),
  });
  if (!result.ok) return { ok: false, reason: "agent", detail: result.detail ?? result.reason };

  const { error } = await supabase
    .from("inbound_messages")
    .update({ command_plan: result.plan, plan_attempted_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) return { ok: false, reason: "save", detail: error.message };
  return { ok: true };
}

/**
 * The pass: plan every recent call that was read, carries a request (an order
 * or a repair, or a voicemail with something said) and has no plan, no ticket
 * and no person's verdict yet. Each call is CLAIMED by stamping
 * `plan_attempted_at` first, so two runs never plan the same call and a call
 * the agent could not plan is not retried every five minutes. Safe to run
 * twice.
 */
export async function draftSuggestions(
  supabase: SupabaseClient,
): Promise<{ planned: number; failed: string[] }> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: rows } = await supabase
    .from("inbound_messages")
    .select("id, channel, body_text, extraction")
    .eq("kind", "customer")
    .eq("status", "matched")
    .is("command_plan", null)
    .is("plan_attempted_at", null)
    .is("ticket_id", null)
    .not("disposition", "in", "(handled,spam)")
    .not("body_text", "is", null)
    .gte("received_at", since)
    .order("received_at", { ascending: true })
    .limit(20);

  const wanted = (rows ?? []).filter((r) => {
    const intent = parseExtraction(r.extraction).intent;
    if (intent === "order_inquiry" || intent === "repair_request") return true;
    return r.channel === "voicemail" && (r.body_text ?? "").trim().length >= MIN_SPEECH_CHARS;
  });

  const claimed: string[] = [];
  for (const r of wanted) {
    if (claimed.length >= MAX_PER_RUN) break;
    const { data } = await supabase
      .from("inbound_messages")
      .update({ plan_attempted_at: new Date().toISOString() })
      .eq("id", r.id)
      .is("plan_attempted_at", null)
      .select("id");
    if (data && data.length > 0) claimed.push(r.id);
  }

  const results = await Promise.allSettled(claimed.map((id) => planCall(supabase, id)));
  const failed: string[] = [];
  let planned = 0;
  results.forEach((res, i) => {
    if (res.status === "fulfilled" && res.value.ok) planned += 1;
    else {
      const why =
        res.status === "rejected"
          ? String(res.reason)
          : res.value.ok
            ? ""
            : `${res.value.reason}${res.value.detail ? `: ${res.value.detail}` : ""}`;
      failed.push(`${claimed[i]}: ${why}`);
    }
  });
  return { planned, failed };
}
