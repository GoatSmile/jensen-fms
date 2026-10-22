import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { AUTO_APPLY_KINDS } from "@/lib/assistant/agent";
import { parseAssistantAnswer, targetHref } from "@/lib/assistant/answer";
import { answerRequest } from "@/lib/assistant/ask";
import { buildAssistantView, COMMAND_VIEW_COLUMNS, type AssistantView, type CommandRow } from "@/lib/assistant/view";
import { readAllowedCaps, readCanSeeCosts, readPersonId } from "@/lib/auth/read-session";
import { revalidateInbound } from "@/lib/calls/revalidate";
import { appliedSummary, pendingSummary } from "@/lib/inbound/command/applied-summary";
import { applyPlanAction, autoApplyMessage, autoApplyOn } from "@/lib/inbound/command/apply";
import { parseCommandPlan } from "@/lib/inbound/command/plan";
import { ALL_CAPABILITIES } from "@/lib/people/capabilities";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/types/database";

export type CommandResult =
  | {
      ok: true;
      id: string;
      /** Go straight here — the answer was one record and nothing else. */ openHref?: string | null;
      /** The answer as stored, so the caller speaks it without a second round trip. */
      view?: AssistantView;
    }
  | { ok: false; error: string };

/**
 * Ask the assistant (owner, 2026-10-01: "a secretary"). Anyone signed in may
 * ask: what the assistant may read, open and draft follows their role
 * (src/lib/assistant/). The request is kept as a kind='command' row — it SKIPS
 * extract → match → triage, the assistant is its own stage — with its answer
 * and drafts, so /commands is the history of what was asked and answered.
 * `priorId` threads ONE earlier request of theirs for a follow-up.
 *
 * Server-only, NOT a server action: the action (`createCommandFromText`) and
 * the streaming route (/api/secretary) both call it, and the route alone
 * passes `onSentence`. Who is asking comes from the session either way.
 */
export async function askAssistant(
  text: string,
  priorId?: string | null,
  opts?: { spoken?: boolean; history?: string[]; language?: string; page?: string },
  /** Each finished sentence of the reply as it is written — /api/secretary passes it on. */
  onSentence?: (sentence: string) => void,
): Promise<CommandResult> {
  const t = await getTranslations("errors");
  const body = text.trim();
  // The reply's language: the one the request was SPOKEN in (Dennis,
  // 2026-10-21), else the person's set language. Checked, never trusted.
  const language: "da" | "en" =
    opts?.language === "da" || opts?.language === "en" ? opts.language : (await getLocale()) === "da" ? "da" : "en";
  if (!body) return { ok: false, error: t("commandNoBody") };
  const personId = await readPersonId();
  const caps = await currentCaps();
  if (personId === null && (await readAllowedCaps()) !== null) return { ok: false, error: t("commandNeedsInbox") };

  const supabase = createServiceClient();
  const { data: inserted, error: insErr } = await supabase
    .from("inbound_messages")
    .insert({
      channel: "in_app",
      kind: "command",
      status: "understood",
      body_text: body,
      commanded_by: personId,
      channel_meta: { source: "in_app_command" },
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return {
      ok: false,
      error: t("inboundCouldNotSave", { detail: insErr?.message ?? t("unknownError") }),
    };
  }

  // A plain YES or NO to what the last reply left waiting (the secretary has
  // nothing to tap — owner, 2026-10-21) is settled here, without the model.
  const settled = await settleWaiting(supabase, inserted.id, body, priorId ?? null, personId, caps, t, language);
  if (settled) {
    revalidateInbound(inserted.id);
    return { ok: true, id: inserted.id, openHref: null, view: await viewOf(supabase, inserted.id) };
  }

  const autoApply = personId !== null && (await autoApplyOn(supabase, personId));
  const r = await answerRequest(supabase, inserted.id, {
    request: body,
    caps,
    canSeeCosts: await readCanSeeCosts(),
    language,
    personId,
    priorId,
    autoApply,
    spoken: opts?.spoken === true,
    // Only ids; answerRequest keeps the asker's own, recent turns.
    history: Array.isArray(opts?.history) ? opts.history.filter((x) => typeof x === "string").slice(-8) : undefined,
    page: typeof opts?.page === "string" ? opts.page : null,
    onSentence,
  });
  // The secretary carries out what is safe at once (owner, 2026-10-21) and the
  // reply was worded as done — so a failure must be said, not left unsaid.
  if (r.ok && autoApply && r.actionCount > 0) {
    const results = await autoApplyMessage(supabase, inserted.id, t);
    const failed = results.filter((x) => !x.ok && !x.duplicate);
    const already = results.filter((x) => x.duplicate);
    const done = results.filter((x) => x.ok);
    const answer = parseAssistantAnswer(r.answer);
    // What was NOT carried out is said by the CODE, never left to the model:
    // on 2026-10-21 it told Finn "Done. I booked …" for a delivery that was
    // waiting for him (nothing reached the calendar).
    const { data: row } = await supabase.from("inbound_messages").select("command_plan, assistant_answer").eq("id", inserted.id).maybeSingle();
    const { data: ledger } = await supabase.from("command_actions").select("plan_action_id").eq("message_id", inserted.id);
    const appliedIds = new Set((ledger ?? []).map((l) => l.plan_action_id as string));
    // Only kinds the model was told happen at once can be wrongly called done;
    // a delete it was told waits, and it asks for the yes itself.
    const waiting = parseCommandPlan(row?.command_plan).actions.filter(
      (a) => !appliedIds.has(a.id) && AUTO_APPLY_KINDS.has(a.type) && !already.some((x) => x.id === a.id),
    );
    // Something was done but the model said nothing: say what was done.
    const silent = answer !== null && !answer.text && done.length > 0;
    if (answer && (failed.length > 0 || silent || waiting.length > 0 || already.length > 0)) {
      const tA = await getTranslations({ locale: language, namespace: "assistant" });
      const tC = await getTranslations({ locale: language, namespace: "inboxCommand" });
      const lines = [
        answer.text || tA("autoDone", { what: done.map((d) => tC(d.type === "draft_event" ? "type_draft_event_visit" : `type_${d.type}`)).join(", ") }),
        ...failed.map((f) => tA("autoFailed", { detail: f.error ?? "" })),
        ...(already.length ? [tA("alreadyInCalendar")] : []),
        ...waiting.map((w) => tA(opts?.spoken ? "notYetSayYes" : "notYetTap", { what: pendingSummary(w, tC) })),
      ];
      // Over the STORED answer: rebuilding it from the parsed one dropped the
      // turn's lookups and timings, so "move it" after a booking had nothing
      // to resolve (found 2026-10-22).
      const stored = (row?.assistant_answer ?? {}) as Record<string, unknown>;
      await supabase
        .from("inbound_messages")
        .update({ assistant_answer: { ...stored, text: lines.join("\n").trim() } as unknown as Json })
        .eq("id", inserted.id);
    }
  }
  revalidateInbound(inserted.id);
  // Asked to SEE one record, nothing to confirm → straight there (owner,
  // 2026-10-01). A question about it shows the answer, with an Open button.
  const openHref =
    r.ok && r.answer.go && r.answer.open && r.actionCount === 0 ? targetHref(r.answer.open) : null;
  return { ok: true, id: inserted.id, openHref, view: openHref ? undefined : await viewOf(supabase, inserted.id) };
}

/** The request as stored, for the caller — it is the asker's own, just made. */
async function viewOf(supabase: ReturnType<typeof createServiceClient>, id: string): Promise<AssistantView | undefined> {
  const { data } = await supabase.from("inbound_messages").select(COMMAND_VIEW_COLUMNS).eq("id", id).maybeSingle();
  return data ? buildAssistantView(supabase, data as CommandRow) : undefined;
}

const YES = /^(ja|jo|jep|yes|yeah|yep|ok|okay|ja tak|ja gerne|ja gør det|ja det må du gerne|gør det|bare gør det|bekræft|bekræftet|det er fint|fint|confirm|confirmed|do it|go ahead|yes please|please do)$/;
const NO = /^(nej|nej tak|nope|no|no thanks|lad være|lad være med det|glem det|annuller|stop|cancel|forget it|don't)$/;

/**
 * The person's YES or NO to the suggestions the previous reply left waiting
 * (deleting an appointment always waits). Only their own request from the
 * last ten minutes counts, each waiting action is applied as THEM with their
 * rights — the same core as a tap — and the reply says what was done.
 * Returns false when this is not such an answer, so the model takes it.
 */
async function settleWaiting(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  body: string,
  priorId: string | null,
  personId: string | null,
  caps: readonly string[],
  t: Awaited<ReturnType<typeof getTranslations>>,
  language: "da" | "en",
): Promise<boolean> {
  const said = body.toLowerCase().replace(/[.!?,]+/g, " ").replace(/\s+/g, " ").trim();
  const yes = YES.test(said);
  if (!priorId || !personId || (!yes && !NO.test(said))) return false;
  const { data: prior } = await supabase
    .from("inbound_messages")
    .select("kind, commanded_by, received_at, command_plan")
    .eq("id", priorId)
    .maybeSingle();
  const recent = prior && Date.now() - new Date(prior.received_at).getTime() < 10 * 60_000;
  if (!prior || !recent || prior.kind !== "command" || prior.commanded_by !== personId) return false;
  const { data: ledger } = await supabase.from("command_actions").select("plan_action_id").eq("message_id", priorId);
  const done = new Set((ledger ?? []).map((r) => r.plan_action_id as string));
  const waiting = parseCommandPlan(prior.command_plan).actions.filter((a) => !done.has(a.id));
  if (waiting.length === 0) return false;

  // The answer is in the conversation's language, like every other reply.
  const tA = await getTranslations({ locale: language, namespace: "assistant" });
  const tC = await getTranslations({ locale: language, namespace: "inboxCommand" });
  const locale = language;
  const lines: string[] = [];
  if (!yes) {
    lines.push(tA("leftAsIs"));
  } else {
    for (const action of waiting) {
      const r = await applyPlanAction(supabase, priorId, action.id, {}, { personId, caps, auto: false }, t);
      if (r.ok) {
        const { data: row } = await supabase
          .from("command_actions")
          .select("entity_table, entity_id, payload")
          .eq("message_id", priorId)
          .eq("plan_action_id", action.id)
          .maybeSingle();
        lines.push(
          appliedSummary(
            row ? { entityTable: row.entity_table, entityId: row.entity_id, payload: row.payload } : undefined,
            tC,
            locale,
          ).text,
        );
      } else {
        lines.push(tA("autoFailed", { detail: r.error }));
      }
    }
  }
  await supabase
    .from("inbound_messages")
    .update({
      assistant_answer: { text: lines.join("\n"), open: null, go: false, choices: [] } as unknown as Json,
      status: "matched",
      processed_at: new Date().toISOString(),
    })
    .eq("id", messageId);
  revalidateInbound(priorId);
  return true;
}

/** The person's rights; the gate off means every right (dev without a login). */
async function currentCaps(): Promise<readonly string[]> {
  return (await readAllowedCaps()) ?? ALL_CAPABILITIES;
}
