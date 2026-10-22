"use server";

import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import { getLocale } from "next-intl/server";

import { readAllowedCaps, readCanSeeCosts, readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { ALL_CAPABILITIES } from "@/lib/people/capabilities";
import { answerRequest } from "@/lib/assistant/ask";
import { planCall, type PlanCallResult } from "@/lib/inbound/command/plan-calls";
import { planNote } from "@/lib/inbound/command/plan-notes";
import { canActOnInbound } from "@/lib/calls/access";
import { revalidateInbound } from "@/lib/calls/revalidate";
import { applyPlanAction } from "@/lib/inbound/command/apply";
import { askAssistant, type CommandResult } from "@/lib/assistant/command-request";

export type { CommandResult } from "@/lib/assistant/command-request";
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
 * Ask the assistant — the typed panel and the fallback of the spoken
 * secretary. The work is `askAssistant` (src/lib/assistant/command-request.ts),
 * shared with the streaming route /api/secretary.
 */
export async function createCommandFromText(
  text: string,
  priorId?: string | null,
  opts?: { spoken?: boolean; history?: string[]; language?: string; page?: string },
): Promise<CommandResult> {
  return askAssistant(text, priorId, opts);
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
