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

import { runAssistant, type ConversationTurn } from "./agent";
import { parseAssistantAnswer, targetHref, type AssistantAnswer } from "./answer";
import { describePage } from "./page";

/** A conversation's turns count while they are this recent, and at most this many. */
const CONVERSATION_MINUTES = 30;
const CONVERSATION_TURNS = 8;

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
    /** The whole conversation so far, oldest first (the secretary's turns) — wins over priorId. */
    history?: string[];
    /** Safe drafts will be carried out at once — the reply words them as done. */
    autoApply?: boolean;
    /** Asked by voice: there is nothing to tap, so a waiting action asks for a spoken yes. */
    spoken?: boolean;
    /** The path of the page the person has open (page.ts checks and describes it). */
    page?: string | null;
  },
): Promise<AskOutcome> {
  const [history, settings, page] = await Promise.all([
    loadConversation(supabase, {
      ids: opts.history?.length ? opts.history : opts.priorId ? [opts.priorId] : [],
      personId: opts.personId,
      language: opts.language,
    }),
    loadInboundSettings(supabase),
    describePage(supabase, opts.page, opts.caps),
  ]);
  const r = await runAssistant(supabase, opts.request, {
    // The assistant's own model (migration 120), not the call reader's.
    model: settings.assistantModel,
    caps: opts.caps,
    canSeeCosts: opts.canSeeCosts,
    language: opts.language,
    personId: opts.personId,
    autoApply: opts.autoApply,
    spoken: opts.spoken,
    history,
    page,
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
      // What this turn looked up rides with it, so the next turn knows what
      // "it" was (owner, 2026-10-21: "move it to another day").
      // `timings`: where the seconds went (model calls, cache, tools) — the
      // phone adds its own (`client_timings`, recordSecretaryTimings).
      assistant_answer: { ...answer, lookups: r.lookups, timings: r.timings, page } as unknown as Json,
      command_plan: r.plan as unknown as Json,
      status: "matched",
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", messageId);
  if (error) return { ok: false, reason: "save", detail: error.message };
  return { ok: true, answer, actionCount: r.plan.actions.length };
}

/**
 * The person's own earlier turns of THIS conversation, oldest first: what was
 * asked, what was answered, what was carried out (the ledger) and what was
 * looked up (with the ids). Never someone else's, never stale.
 */
async function loadConversation(
  supabase: SupabaseClient,
  opts: { ids: string[]; personId: string | null; language: "da" | "en" },
): Promise<ConversationTurn[]> {
  const ids = [...new Set(opts.ids)].slice(-CONVERSATION_TURNS);
  if (ids.length === 0 || !opts.personId) return [];
  const since = Date.now() - CONVERSATION_MINUTES * 60_000;
  const [{ data: rows }, { data: ledger }] = await Promise.all([
    supabase
      .from("inbound_messages")
      .select("id, body_text, assistant_answer, commanded_by, received_at, kind")
      .in("id", ids),
    supabase.from("command_actions").select("message_id, entity_table, entity_id, payload").in("message_id", ids),
  ]);
  const tC = await getTranslations({ locale: opts.language, namespace: "inboxCommand" });
  return (rows ?? [])
    .filter((r) => r.kind === "command" && r.commanded_by === opts.personId && new Date(r.received_at).getTime() >= since)
    .sort((a, b) => a.received_at.localeCompare(b.received_at))
    .map((r) => {
      const raw = (r.assistant_answer ?? {}) as { lookups?: unknown };
      return {
        request: r.body_text ?? "",
        answer: parseAssistantAnswer(r.assistant_answer)?.text ?? "",
        done: (ledger ?? [])
          .filter((l) => l.message_id === r.id)
          .map((l) => appliedSummary({ entityTable: l.entity_table, entityId: l.entity_id, payload: l.payload }, tC, opts.language).text),
        lookups: Array.isArray(raw.lookups) ? raw.lookups.filter((x): x is string => typeof x === "string") : [],
      };
    });
}
