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

import { getTranslations } from "next-intl/server";

import { appliedSummary } from "@/lib/inbound/command/applied-summary";
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
    /** Safe drafts will be carried out at once — the reply words them as done. */
    autoApply?: boolean;
    /** Asked by voice: there is nothing to tap, so a waiting action asks for a spoken yes. */
    spoken?: boolean;
  },
): Promise<AskOutcome> {
  let prior: { request: string; answer: string; done: string[] } | null = null;
  if (opts.priorId) {
    const { data } = await supabase
      .from("inbound_messages")
      .select("body_text, assistant_answer, commanded_by, received_at, kind")
      .eq("id", opts.priorId)
      .maybeSingle();
    const recent = data && Date.now() - new Date(data.received_at).getTime() < FOLLOW_UP_MINUTES * 60_000;
    // Only the same person's own request — never someone else's conversation.
    if (data && recent && data.kind === "command" && data.commanded_by === opts.personId) {
      // What that turn actually CARRIED OUT, from the ledger — its words alone
      // let the model conclude it had not booked, and book again (2026-10-21).
      const { data: ledger } = await supabase
        .from("command_actions")
        .select("entity_table, entity_id, payload")
        .eq("message_id", opts.priorId);
      const tC = await getTranslations({ locale: opts.language, namespace: "inboxCommand" });
      const done = (ledger ?? []).map(
        (l) => appliedSummary({ entityTable: l.entity_table, entityId: l.entity_id, payload: l.payload }, tC, opts.language).text,
      );
      prior = { request: data.body_text ?? "", answer: parseAssistantAnswer(data.assistant_answer)?.text ?? "", done };
    }
  }

  const settings = await loadInboundSettings(supabase);
  const r = await runAssistant(supabase, opts.request, {
    // The assistant's own model (migration 120), not the call reader's.
    model: settings.assistantModel,
    caps: opts.caps,
    canSeeCosts: opts.canSeeCosts,
    language: opts.language,
    personId: opts.personId,
    autoApply: opts.autoApply,
    spoken: opts.spoken,
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
