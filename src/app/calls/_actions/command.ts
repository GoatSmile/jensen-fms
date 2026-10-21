"use server";

import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import { getLocale } from "next-intl/server";

import { readAllowedCaps, readCanSeeCosts, readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { ALL_CAPABILITIES } from "@/lib/people/capabilities";
import { answerRequest } from "@/lib/assistant/ask";
import { targetHref } from "@/lib/assistant/answer";
import { planCall, type PlanCallResult } from "@/lib/inbound/command/plan-calls";
import { planNote } from "@/lib/inbound/command/plan-notes";
import { canActOnInbound } from "@/lib/calls/access";
import { revalidateInbound } from "@/lib/calls/revalidate";
import { applyPlanAction, autoApplyMessage, autoApplyOn } from "@/lib/inbound/command/apply";
import { parseAssistantAnswer } from "@/lib/assistant/answer";
import { AUTO_APPLY_KINDS } from "@/lib/assistant/agent";
import { appliedSummary, pendingSummary } from "@/lib/inbound/command/applied-summary";
import { parseCommandPlan } from "@/lib/inbound/command/plan";
import type { Json } from "@/lib/types/database";

export type CommandResult =
  | { ok: true; id: string; /** Go straight here — the answer was one record and nothing else. */ openHref?: string | null }
  | { ok: false; error: string };
export type ApplyResult =
  | { ok: true; entityTable: string | null; entityId: string | null }
  | { ok: false; error: string };


/** The person's rights; the gate off means every right (dev without a login). */
async function currentCaps(): Promise<readonly string[]> {
  return (await readAllowedCaps()) ?? ALL_CAPABILITIES;
}

/**
 * Who may plan or apply on a message: a REQUEST to the assistant is its
 * asker's, and the office's (`inbox`); a CALL is whoever may act on that call
 * (`canActOnInbound` — every line with `inbox`, one's own with `calls_own`).
 * What a person may then APPLY is checked per action (`mayApply`).
 */
async function refuseUnlessMayAct(
  messageId: string,
  kind: string | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
  commandedBy: string | null = null,
): Promise<{ ok: false; error: string } | null> {
  if (kind === "command") {
    if (await readHasCapability("inbox")) return null;
    const me = await readPersonId();
    return me && me === commandedBy ? null : { ok: false, error: t("commandNeedsInbox") };
  }
  return (await canActOnInbound(messageId)) ? null : { ok: false, error: t("callNoAccess") };
}

function planError(r: Exclude<PlanCallResult, { ok: true }>, t: Awaited<ReturnType<typeof getTranslations>>): string {
  switch (r.reason) {
    case "no_body":
      return t("commandNoBody");
    case "locked":
      return t("commandRerunLocked");
    case "agent":
      return t("inboundModelApiError", { detail: r.detail ?? r.reason });
    case "save":
      return t("couldNotSave", { detail: r.detail ?? "" });
    default:
      return t("missingId");
  }
}

/** The logged-in person id — every session carries one (migration 80). */
async function currentPersonId(): Promise<string | null> {
  return readPersonId();
}

/**
 * Ask the assistant (owner, 2026-10-01: "a secretary"). Anyone signed in may
 * ask: what the assistant may read, open and draft follows their role
 * (src/lib/assistant/). The request is kept as a kind='command' row — it SKIPS
 * extract → match → triage, the assistant is its own stage — with its answer
 * and drafts, so /commands is the history of what was asked and answered.
 * `priorId` threads ONE earlier request of theirs for a follow-up.
 */
export async function createCommandFromText(
  text: string,
  priorId?: string | null,
  opts?: { spoken?: boolean },
): Promise<CommandResult> {
  const t = await getTranslations("errors");
  const body = text.trim();
  if (!body) return { ok: false, error: t("commandNoBody") };
  const personId = await currentPersonId();
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
  const settled = await settleWaiting(supabase, inserted.id, body, priorId ?? null, personId, caps, t);
  if (settled) {
    revalidateInbound(inserted.id);
    return { ok: true, id: inserted.id, openHref: null };
  }

  const autoApply = personId !== null && (await autoApplyOn(supabase, personId));
  const r = await answerRequest(supabase, inserted.id, {
    request: body,
    caps,
    canSeeCosts: await readCanSeeCosts(),
    language: (await getLocale()) === "da" ? "da" : "en",
    personId,
    priorId,
    autoApply,
    spoken: opts?.spoken === true,
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
    const { data: row } = await supabase.from("inbound_messages").select("command_plan").eq("id", inserted.id).maybeSingle();
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
      const tA = await getTranslations("assistant");
      const tC = await getTranslations("inboxCommand");
      const lines = [
        answer.text || tA("autoDone", { what: done.map((d) => tC(d.type === "draft_event" ? "type_draft_event_visit" : `type_${d.type}`)).join(", ") }),
        ...failed.map((f) => tA("autoFailed", { detail: f.error ?? "" })),
        ...(already.length ? [tA("alreadyInCalendar")] : []),
        ...waiting.map((w) => tA(opts?.spoken ? "notYetSayYes" : "notYetTap", { what: pendingSummary(w, tC) })),
      ];
      await supabase
        .from("inbound_messages")
        .update({ assistant_answer: { ...answer, text: lines.join("\n").trim() } as unknown as Json })
        .eq("id", inserted.id);
    }
  }
  revalidateInbound(inserted.id);
  // Asked to SEE one record, nothing to confirm → straight there (owner,
  // 2026-10-01). A question about it shows the answer, with an Open button.
  const openHref =
    r.ok && r.answer.go && r.answer.open && r.actionCount === 0 ? targetHref(r.answer.open) : null;
  return { ok: true, id: inserted.id, openHref };
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

  const tA = await getTranslations("assistant");
  const tC = await getTranslations("inboxCommand");
  const locale = await getLocale();
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

/** Re-run the agent on an existing command row's body_text (e.g. after edit). */
export async function rerunCommandAgent(messageId: string): Promise<CommandResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();
  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, body_text, kind, commanded_by")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: t("missingId") };
  // A note is re-read by the note planner; a call's suggestions are re-drafted
  // from the call, not from body_text as a command.
  if (msg.kind === "note") {
    const refusedNote = await refuseUnlessMayAct(messageId, "note", t);
    if (refusedNote) return refusedNote;
    const r = await planNote(supabase, messageId);
    revalidateInbound(messageId);
    if (!r.ok) return { ok: false, error: planError(r, t) };
    return { ok: true, id: messageId };
  }
  if (msg.kind !== "command") return planFromInquiry(messageId);
  const refused = await refuseUnlessMayAct(messageId, "command", t, msg.commanded_by);
  if (refused) return refused;

  // Refuse to re-plan once anything has been applied. plan_action_ids are
  // positional (a0, a1… by array index), so a fresh plan would reuse ids that
  // now point at DIFFERENT actions than the persisted command_actions rows —
  // corrupting provenance and the applied/idempotency state. Re-run is only
  // for tuning a plan BEFORE the first apply.
  const { count: appliedCount } = await supabase
    .from("command_actions")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId);
  if ((appliedCount ?? 0) > 0) {
    return { ok: false, error: t("commandRerunLocked") };
  }

  const r = await answerRequest(supabase, messageId, {
    request: msg.body_text ?? "",
    caps: await currentCaps(),
    canSeeCosts: await readCanSeeCosts(),
    language: (await getLocale()) === "da" ? "da" : "en",
    personId: await currentPersonId(),
  });
  revalidateInbound(messageId);
  if (!r.ok) return { ok: false, error: t("inboundModelApiError", { detail: r.detail ?? r.reason }) };
  return { ok: true, id: messageId };
}

/**
 * A call → a plan of draft actions (P2), on request. The import job drafts
 * them by itself for new calls (`draftSuggestions`); this is the button for
 * older calls and for "draft them again".
 *
 * The lead path used to dead-end: an `order_inquiry` reaching /inbox could
 * only be marked handled, so the most valuable call the shop can receive left
 * no customer, no order and no trace. Rather than build a second action
 * system, this phrases the call as a staff task and reuses the VC-1 command
 * agent + CommandPlanPanel wholesale.
 *
 * Unlike `runAndStorePlan` this writes ONLY `command_plan` (inside
 * `planCall`): the row is a real pipeline message whose `status`, `error` and
 * `processed_at` belong to extract → match → triage.
 */
export async function planFromInquiry(messageId: string): Promise<CommandResult> {
  const t = await getTranslations("errors");
  const refused = await refuseUnlessMayAct(messageId, "customer", t);
  if (refused) return refused;
  const r = await planCall(createServiceClient(), messageId);
  if (!r.ok) return { ok: false, error: planError(r, t) };
  revalidateInbound(messageId);
  return { ok: true, id: messageId };
}

/**
 * Apply ONE proposed action → the real draft, logging a command_actions row
 * (provenance) and blocking double-apply via the unique (message, action)
 * index. `filled` carries the reviewer's open-slot picks (template / segment /
 * colour ids). A sales order that references a new customer requires that
 * customer's action to be applied first.
 */
export async function applyCommandAction(
  messageId: string,
  actionId: string,
  filled: Record<string, string>,
): Promise<ApplyResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();

  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, kind, command_plan, commanded_by")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: t("missingId") };
  const refused = await refuseUnlessMayAct(messageId, msg.kind, t, msg.commanded_by);
  if (refused) return refused;

  const r = await applyPlanAction(supabase, messageId, actionId, filled, {
    personId: await currentPersonId(),
    caps: await currentCaps(),
    auto: false,
  }, t);
  if (r.ok) revalidateInbound(messageId);
  return r;
}
