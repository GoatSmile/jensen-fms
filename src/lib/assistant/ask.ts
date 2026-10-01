/**
 * Run the assistant on a stored request (a kind='command' row) and keep what
 * came back on it: the answer (migration 119) beside the drafts
 * (`command_plan`). Shared by a new request and by *Re-run*, so both store
 * the same shape. Callers check who may ask; this does not.
 *
 * One more filter than the agent applies: a record is only offered to OPEN
 * if this person's role may open its page (`routeAllows` — the same rule
 * middleware uses), so the assistant never sends a technician to a bounce.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadInboundSettings } from "@/lib/inbound/settings";
import { routeAllows } from "@/lib/people/routes";
import type { Json } from "@/lib/types/database";

import { runAssistant } from "./agent";
import { parseAssistantAnswer, targetHref, type AssistantAnswer } from "./answer";

/** A follow-up remembers ONE earlier exchange, if it is this recent. */
const FOLLOW_UP_MINUTES = 10;

export type AskOutcome =
  | { ok: true; answer: AssistantAnswer; actionCount: number }
  | { ok: false; reason: string; detail?: string };

export async function answerRequest(
  supabase: SupabaseClient,
  messageId: string,
  opts: {
    request: string;
    caps: readonly string[];
    canSeeCosts: boolean;
    language: "da" | "en";
    personId: string | null;
    /** The person's previous request, for "and the one after?". */
    priorId?: string | null;
  },
): Promise<AskOutcome> {
  let prior: { request: string; answer: string } | null = null;
  if (opts.priorId) {
    const { data } = await supabase
      .from("inbound_messages")
      .select("body_text, assistant_answer, commanded_by, received_at, kind")
      .eq("id", opts.priorId)
      .maybeSingle();
    const recent = data && Date.now() - new Date(data.received_at).getTime() < FOLLOW_UP_MINUTES * 60_000;
    // Only the same person's own request — never someone else's conversation.
    if (data && recent && data.kind === "command" && data.commanded_by === opts.personId) {
      prior = { request: data.body_text ?? "", answer: parseAssistantAnswer(data.assistant_answer)?.text ?? "" };
    }
  }

  const settings = await loadInboundSettings(supabase);
  const r = await runAssistant(supabase, opts.request, {
    model: settings.extractionModel,
    caps: opts.caps,
    canSeeCosts: opts.canSeeCosts,
    language: opts.language,
    prior,
  });
  if (!r.ok) {
    await supabase
      .from("inbound_messages")
      .update({ status: "failed", error: `assistant.${r.reason}${r.detail ? `: ${r.detail}` : ""}` })
      .eq("id", messageId);
    return { ok: false, reason: r.reason, detail: r.detail };
  }

  const opens = (t: { kind: Parameters<typeof targetHref>[0]["kind"]; id: string }) =>
    routeAllows(targetHref(t).split("?")[0], opts.caps);
  const open = r.answer.open && opens(r.answer.open) ? r.answer.open : null;
  const answer: AssistantAnswer = {
    text: r.answer.text,
    open,
    go: open !== null && r.answer.go,
    choices: r.answer.choices.filter(opens),
  };

  const { error } = await supabase
    .from("inbound_messages")
    .update({
      assistant_answer: answer as unknown as Json,
      command_plan: r.plan as unknown as Json,
      status: "matched",
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", messageId);
  if (error) return { ok: false, reason: "save", detail: error.message };
  return { ok: true, answer, actionCount: r.plan.actions.length };
}
