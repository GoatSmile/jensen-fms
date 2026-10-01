"use server";

import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/types/database";
import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { loadInboundSettings } from "@/lib/inbound/settings";
import { runCommandAgent } from "@/lib/inbound/command/agent";
import { planCall, type PlanCallResult } from "@/lib/inbound/command/plan-calls";
import {
  parseCommandPlan,
  type CommandAction,
  unfilledRequiredSlots,
} from "@/lib/inbound/command/plan";
import {
  insertDraftOffer,
  insertDraftOrganization,
  insertDraftSalesOrder,
} from "@/lib/commercial/draft-writers";
import { canActOnInbound } from "@/lib/calls/access";
import { createTicketForCall } from "@/lib/calls/ticket";
import { createCalendarEntry } from "@/lib/calendar/entries";
import { appOrigin } from "@/lib/qr";
import { createDraftPOsForDemand } from "@/lib/purchasing/draft-pos";
import { revalidateInbound } from "@/lib/calls/revalidate";

export type CommandResult = { ok: true; id: string } | { ok: false; error: string };
export type ApplyResult =
  | { ok: true; entityTable: string | null; entityId: string | null }
  | { ok: false; error: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The inbox is where commands are made and applied, so every action here needs
 * `inbox` — middleware only gates the PAGE, and a server action is callable
 * from anywhere that imports it. Applying a draft also needs the capability of
 * what it writes (DRAFT_CAPABILITY), since a draft customer, SO or PO is a real
 * row in that area.
 */
async function refuseWithoutInbox(
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<{ ok: false; error: string } | null> {
  return (await readHasCapability("inbox"))
    ? null
    : { ok: false, error: t("commandNeedsInbox") };
}

const DRAFT_CAPABILITY: Record<string, string> = {
  draft_customer: "customers",
  draft_offer: "so",
  draft_sales_order: "so",
  draft_purchase_order: "po",
  // draft_ticket / draft_event: none beyond acting on the call — the same
  // rule as the call page's "Create ticket", which a technician may press on
  // their own calls; the calendar is the technician's own diary.
};

/**
 * Who may plan or apply on a message: a dictated COMMAND is the office's
 * (`inbox`); a CALL is whoever may act on that call (`canActOnInbound` — every
 * line with `inbox`, one's own with `calls_own`).
 */
async function refuseUnlessMayAct(
  messageId: string,
  kind: string | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<{ ok: false; error: string } | null> {
  if (kind === "command") return refuseWithoutInbox(t);
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
 * In-app command ingress (VC-1, Option A — text-first). Create a kind='command'
 * inbound row from dictated/typed text, then run the command agent and store
 * its plan. The command path SKIPS extract → match → triage (a staff command
 * from an unknown number would score as spam); the agent is its own stage.
 */
export async function createCommandFromText(text: string): Promise<CommandResult> {
  const t = await getTranslations("errors");
  const refused = await refuseWithoutInbox(t);
  if (refused) return refused;
  const body = text.trim();
  if (!body) return { ok: false, error: t("commandNoBody") };

  const supabase = createServiceClient();
  const personId = await currentPersonId();

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

  await runAndStorePlan(supabase, inserted.id, body);
  revalidateInbound(inserted.id);
  return { ok: true, id: inserted.id };
}

/** Re-run the agent on an existing command row's body_text (e.g. after edit). */
export async function rerunCommandAgent(messageId: string): Promise<CommandResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();
  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, body_text, kind")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: t("missingId") };
  // A call's suggestions are re-drafted from the call, not from body_text as a command.
  if (msg.kind !== "command") return planFromInquiry(messageId);
  const refused = await refuseWithoutInbox(t);
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

  await runAndStorePlan(supabase, messageId, msg.body_text ?? "");
  revalidateInbound(messageId);
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

/** Run the agent and stamp the plan (or the failure) onto the row. */
async function runAndStorePlan(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  body: string,
): Promise<void> {
  const settings = await loadInboundSettings(supabase);
  const result = await runCommandAgent(supabase, body, {
    model: settings.extractionModel,
    today: today(),
  });
  if (!result.ok) {
    await supabase
      .from("inbound_messages")
      .update({
        status: "failed",
        command_plan: null,
        error: `command.${result.reason}${result.detail ? `: ${result.detail}` : ""}`,
      })
      .eq("id", messageId);
    return;
  }
  await supabase
    .from("inbound_messages")
    .update({
      command_plan: result.plan,
      status: "matched",
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", messageId);
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
    .select("id, kind, command_plan")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: t("missingId") };
  const refused = await refuseUnlessMayAct(messageId, msg.kind, t);
  if (refused) return refused;

  const plan = parseCommandPlan(msg.command_plan);
  const action = plan.actions.find((a) => a.id === actionId);
  if (!action) return { ok: false, error: t("commandActionNotFound") };
  const needed = DRAFT_CAPABILITY[action.type];
  if (needed && !(await readHasCapability(needed))) {
    return { ok: false, error: t("commandNeedsCapability") };
  }

  // Already applied (or being applied)? Idempotent for a resent request.
  const { data: existing } = await supabase
    .from("command_actions")
    .select("entity_table, entity_id")
    .eq("message_id", messageId)
    .eq("plan_action_id", actionId)
    .maybeSingle();
  if (existing) {
    return { ok: true, entityTable: existing.entity_table, entityId: existing.entity_id };
  }

  // All non-optional open slots must be filled before we write.
  const missing = unfilledRequiredSlots(action, filled);
  if (missing.length > 0) {
    return { ok: false, error: t("commandSlotsUnfilled") };
  }

  // CLAIM the ledger row before writing anything: the unique index on
  // (message, action) makes a second press — sequential or concurrent — lose
  // here instead of writing a second draft. The draft used to be written
  // first, so a ledger insert that failed left the draft behind and the next
  // press made another (found 2026-09-30).
  const personId = await currentPersonId();
  const { data: claim, error: claimErr } = await supabase
    .from("command_actions")
    .insert({
      message_id: messageId,
      plan_action_id: actionId,
      action_type: action.type,
      applied_by: personId,
    })
    .select("id")
    .single();
  if (claimErr || !claim) {
    if (claimErr?.code === "23505") return { ok: true, entityTable: null, entityId: null };
    return { ok: false, error: t("couldNotSave", { detail: claimErr?.message ?? "" }) };
  }

  const write = await performAction(supabase, messageId, plan.actions, action, filled, t);
  if (!write.ok) {
    // Nothing was created: release the claim so the person can try again.
    await supabase.from("command_actions").delete().eq("id", claim.id);
    return write;
  }

  const { error: logErr } = await supabase
    .from("command_actions")
    .update({
      entity_table: write.entityTable,
      entity_id: write.entityId,
      payload: write.payload,
    })
    .eq("id", claim.id);
  if (logErr) {
    // The draft exists and the claim still blocks a second one; only its link
    // is missing. Surface it rather than roll the draft back.
    return { ok: false, error: t("couldNotSave", { detail: logErr.message }) };
  }

  // If every action now has a command_actions row, the command is done.
  const { count } = await supabase
    .from("command_actions")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId);
  if ((count ?? 0) >= plan.actions.length) {
    await supabase
      .from("inbound_messages")
      .update({ status: "actioned" })
      .eq("id", messageId);
  }

  revalidateInbound(messageId);
  return { ok: true, entityTable: write.entityTable, entityId: write.entityId };
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

type PerformResult =
  | { ok: true; entityTable: string; entityId: string | null; payload: Json }
  | { ok: false; error: string };

/** Dispatch one action to its pure draft writer. */
async function performAction(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  allActions: CommandAction[],
  action: CommandAction,
  filled: Record<string, string>,
  t: Translator,
): Promise<PerformResult> {
  switch (action.type) {
    case "draft_customer": {
      const segmentId = action.segmentId ?? filled.segment;
      if (!segmentId) return { ok: false, error: t("commandSlotsUnfilled") };
      const r = await insertDraftOrganization(supabase, {
        legalName: action.legalName,
        customerSegmentId: segmentId,
        preferredLanguage: action.preferredLanguage,
      });
      if (!r.ok) return { ok: false, error: t("orgCouldNotCreate", { detail: r.error }) };
      return {
        ok: true,
        entityTable: "organizations",
        entityId: r.id,
        payload: { legalName: action.legalName, customerSegmentId: segmentId },
      };
    }

    case "draft_sales_order": {
      const customer = await resolveCustomer(supabase, messageId, allActions, action);
      if (!customer.ok) return { ok: false, error: t(customer.error) };
      const organizationId = customer.id;

      const templateId = action.templateId ?? filled.template;
      if (!templateId) return { ok: false, error: t("commandSlotsUnfilled") };
      const colorId = action.colorId ?? filled.color ?? null;

      const r = await insertDraftSalesOrder(supabase, {
        organizationId,
        language: action.language,
        currency: action.currency,
        orderDate: action.orderDate ?? today(),
        deliveryDate: action.deliveryDate,
        deliveryPrecision: action.deliveryPrecision,
        productionNote: action.productionNote,
        line: {
          quantity: action.quantity,
          templateId,
          colorId,
          unitPrice: action.unitPrice,
        },
      });
      if (!r.ok) return { ok: false, error: t("soCouldNotCreate", { detail: r.error }) };
      return {
        ok: true,
        entityTable: "sales_orders",
        entityId: r.id,
        payload: { number: r.number, organizationId, templateId, colorId, quantity: action.quantity },
      };
    }

    case "draft_offer": {
      const organizationId = await resolveCustomer(supabase, messageId, allActions, action);
      if (!organizationId.ok) return { ok: false, error: t(organizationId.error) };
      const templateId = action.templateId ?? filled.template;
      if (!templateId) return { ok: false, error: t("commandSlotsUnfilled") };
      const colorId = action.colorId ?? filled.color ?? null;

      const r = await insertDraftOffer(supabase, {
        organizationId: organizationId.id,
        language: action.language,
        currency: action.currency,
        notes: action.note,
        line: { quantity: action.quantity, templateId, colorId, unitPrice: action.unitPrice },
      });
      if (!r.ok) return { ok: false, error: t("offerCouldNotCreate", { detail: r.error }) };
      return {
        ok: true,
        entityTable: "offers",
        entityId: r.id,
        payload: { number: r.number, organizationId: organizationId.id, templateId, colorId, quantity: action.quantity },
      };
    }

    case "draft_ticket": {
      const r = await createTicketForCall(supabase, messageId, t, {
        description: action.description,
        urgency: action.urgency,
      });
      if (!r.ok) return r;
      return {
        ok: true,
        entityTable: "maintenance_tickets",
        entityId: r.ticketId,
        payload: { number: r.ticketNumber },
      };
    }

    case "draft_event": {
      // The person's corrections on the card win over the model's reading.
      const date = (filled.date ?? action.date ?? "").trim();
      if (!date) return { ok: false, error: t("visitNeedsDate") };
      // An emptied time field means "all day"; an absent one, the kind's default.
      const time = filled.time !== undefined ? filled.time.trim() || null : action.time;
      const minutes = filled.duration ? Number(filled.duration) : action.durationMinutes;

      const { data: msg } = await supabase
        .from("inbound_messages")
        .select("kind, ticket_id, matched_organization_id")
        .eq("id", messageId)
        .maybeSingle();
      const isCommand = msg?.kind === "command";
      const r = await createCalendarEntry(supabase, {
        kind: action.kind,
        title: action.title,
        // Minimal personal data in the provider: the title and a way back.
        description: `${t(isCommand ? "calendarEventLinkCommand" : "visitEventLink")}: ${appOrigin()}/${isCommand ? "commands" : "calls"}/${messageId}`,
        location: action.location,
        date,
        time,
        durationMinutes: minutes,
        messageId,
        ticketId: msg?.ticket_id ?? null,
        organizationId: action.organizationId ?? msg?.matched_organization_id ?? null,
        createdBy: await currentPersonId(),
      });
      if (!r.ok) {
        const key = {
          not_configured: "calendarNotConfigured",
          bad_date: "visitNeedsDate",
          bad_time: "visitBadTime",
          bad_duration: "visitBadDuration",
          provider: "calendarCouldNotCreate",
          link: "calendarLinkFailed",
        }[r.code];
        return { ok: false, error: t(key, { detail: r.detail ?? "" }) };
      }
      return {
        ok: true,
        entityTable: "calendar_events",
        entityId: r.linkId,
        payload: { kind: action.kind, date, time, eventId: r.event.id },
      };
    }

    case "draft_purchase_order": {
      const demands = action.items.map((it) => ({
        partId: it.partId,
        sku: it.partLabel,
        name: it.partLabel,
        quantity: it.quantity,
        lineNote: action.note ?? "Drafted from a voice command.",
      }));
      const r = await createDraftPOsForDemand(
        supabase,
        demands,
        action.note ?? "Drafted from a voice command — review before placing.",
      );
      if (!r.ok) return { ok: false, error: r.error };
      // One or more POs; log the first as the entity link, all in the payload.
      const first = r.pos[0] ?? null;
      return {
        ok: true,
        entityTable: "purchase_orders",
        entityId: first?.id ?? null,
        payload: { pos: r.pos, skipped: r.skipped },
      };
    }
  }
}

/**
 * The customer a sales order or offer is for: an existing organisation, or the
 * one this plan's draft_customer action created — which must be applied first.
 */
async function resolveCustomer(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  allActions: CommandAction[],
  action: { organizationId: string | null; organizationFromNewCustomer: boolean },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (action.organizationId) return { ok: true, id: action.organizationId };
  if (!action.organizationFromNewCustomer) return { ok: false, error: "commandNeedsCustomer" };
  const custAction = allActions.find((a) => a.type === "draft_customer");
  if (!custAction) return { ok: false, error: "commandNeedsCustomer" };
  const { data: applied } = await supabase
    .from("command_actions")
    .select("entity_id")
    .eq("message_id", messageId)
    .eq("plan_action_id", custAction.id)
    .eq("entity_table", "organizations")
    .maybeSingle();
  if (!applied?.entity_id) return { ok: false, error: "commandApplyCustomerFirst" };
  return { ok: true, id: applied.entity_id };
}
