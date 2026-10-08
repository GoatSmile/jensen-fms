/**
 * APPLYING one suggested action — the core every door shares: a person's
 * press (`applyCommandAction`, the server action, which checks the session
 * first) and *act right away* (`autoApplyNote`, run for the speaker after a
 * note is read). Server-only and NOT a server action: it takes WHO is acting
 * as an argument, so it must never be callable from a browser.
 *
 * Claim the ledger row, write the draft through its pure writer, record what
 * it made — and close a note whose work is done.
 */
import "server-only";

import { revalidatePath } from "next/cache";
import type { getTranslations } from "next-intl/server";

import { autoApplySafe, mayApply } from "@/lib/assistant/agent";
import { createCalendarEntry, deleteCalendarEntry, moveCalendarEntry } from "@/lib/calendar/entries";
import { CALENDAR_KIND_SPECS } from "@/lib/calendar/kinds";
import { createTicketForCall } from "@/lib/calls/ticket";
import {
  insertDraftOffer,
  insertDraftOrganization,
  insertDraftSalesOrder,
} from "@/lib/commercial/draft-writers";
import { createDraftPOsForDemand } from "@/lib/purchasing/draft-pos";
import { loadPersonAccess } from "@/lib/people/queries";
import { appOrigin } from "@/lib/qr";
import { inheritTestTitle } from "@/lib/test-marker";
import type { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/types/database";

import {
  countOpenSuggestions,
  parseCommandPlan,
  type CommandAction,
  type CommandPlan,
  unfilledRequiredSlots,
} from "./plan";

/** Who is acting: the signed-in person, or the speaker on whose behalf it runs. */
export type Actor = { personId: string | null; caps: readonly string[]; auto: boolean };

export type ApplyResult =
  | { ok: true; entityTable: string | null; entityId: string | null }
  | { ok: false; error: string };

/**
 * Refresh a page that shows what was just written — but never let a refresh
 * fail an apply: run for *act right away* in the background (after a save, or
 * in the five-minute job) there may be no request to refresh for.
 */
function safeRevalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    /* no request in scope — the next visit renders fresh anyway */
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Apply one action of a message's plan, as `actor`. Access to the MESSAGE is the caller's check. */
export async function applyPlanAction(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  actionId: string,
  filled: Record<string, string>,
  actor: Actor,
  t: Translator,
): Promise<ApplyResult> {
  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, kind, command_plan")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: t("missingId") };

  const plan = parseCommandPlan(msg.command_plan);
  const action = plan.actions.find((a) => a.id === actionId);
  if (!action) return { ok: false, error: t("commandActionNotFound") };
  // A CALL never creates a customer (owner, 2026-10-01): a transcript garbles
  // names, so a proposed new customer from a call is usually an existing one
  // misheard. Pick the customer on the order or offer instead.
  if (action.type === "draft_customer" && msg.kind !== "command") {
    return { ok: false, error: t("callNoNewCustomer") };
  }
  // Each action carries its own right — the assistant offers only what its
  // asker may apply, and this is where that is enforced.
  if (!mayApply(action.type, actor.caps)) {
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
  const personId = actor.personId;
  const { data: claim, error: claimErr } = await supabase
    .from("command_actions")
    .insert({
      message_id: messageId,
      plan_action_id: actionId,
      action_type: action.type,
      applied_by: personId,
      auto_applied: actor.auto,
    })
    .select("id")
    .single();
  if (claimErr || !claim) {
    if (claimErr?.code === "23505") return { ok: true, entityTable: null, entityId: null };
    return { ok: false, error: t("couldNotSave", { detail: claimErr?.message ?? "" }) };
  }

  const write = await performAction(supabase, messageId, plan.actions, action, filled, t, actor);
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
  // A NOTE closes itself once nothing required is left (plan-inbox-notes.md,
  // decision 10): its suggestions were the work it carried.
  if (msg.kind === "note") await closeNoteIfSettled(supabase, messageId, plan, personId);

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
  actor: Actor,
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
      const customer = await resolveCustomer(supabase, messageId, allActions, action, filled);
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
      await linkDeliveriesTo(supabase, messageId, { sales_order_id: r.id });
      return {
        ok: true,
        entityTable: "sales_orders",
        entityId: r.id,
        payload: { number: r.number, organizationId, templateId, colorId, quantity: action.quantity },
      };
    }

    case "draft_offer": {
      const organizationId = await resolveCustomer(supabase, messageId, allActions, action, filled);
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
      await linkDeliveriesTo(supabase, messageId, { offer_id: r.id });
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
        .select("kind, ticket_id, matched_organization_id, body_text")
        .eq("id", messageId)
        .maybeSingle();
      const isCommand = msg?.kind === "command";
      // A delivery belongs to the order this plan drafted, if one is applied
      // already — the order page then shows it and offers no second entry.
      // (Applied the other way round, the offer stamps it: see draft_offer.)
      const order = action.kind === "delivery" ? await appliedOrderOf(supabase, messageId) : null;
      const r = await createCalendarEntry(supabase, {
        kind: action.kind,
        // A TEST note's or call's entry is marked too — the model drops it.
        title: inheritTestTitle(msg?.body_text, action.title),
        // Minimal personal data in the provider: the title and a way back.
        description: `${t(isCommand ? "calendarEventLinkCommand" : "visitEventLink")}: ${appOrigin()}/${isCommand ? "commands" : "calls"}/${messageId}`,
        location: action.location,
        date,
        time,
        durationMinutes: minutes,
        messageId,
        ticketId: msg?.ticket_id ?? null,
        organizationId: filled.customer ?? action.organizationId ?? msg?.matched_organization_id ?? null,
        offerId: order?.offerId ?? null,
        salesOrderId: order?.salesOrderId ?? null,
        createdBy: actor.personId,
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
        // The time it was PUT IN at — a missing one took the kind's default.
        payload: { kind: action.kind, date, time: time ?? CALENDAR_KIND_SPECS[action.kind].defaultTime, eventId: r.event.id },
      };
    }

    case "move_event": {
      const r = await moveCalendarEntry(supabase, {
        eventId: action.eventId,
        date: (filled.date ?? action.date).trim(),
        time: filled.time !== undefined ? filled.time.trim() || null : action.time,
        durationMinutes: action.durationMinutes,
      });
      if (!r.ok) return { ok: false, error: t(calendarChangeError(r.code), { detail: r.detail ?? "" }) };
      return {
        ok: true,
        entityTable: "calendar_events",
        entityId: null,
        payload: {
          kind: r.before.kind ?? "visit",
          date: (filled.date ?? action.date).trim(),
          time: r.event && !r.event.allDay ? r.event.start.slice(11, 16) : null,
          eventId: action.eventId,
          moved: true,
          title: r.before.title,
        },
      };
    }

    case "delete_event": {
      const r = await deleteCalendarEntry(supabase, action.eventId);
      if (!r.ok) return { ok: false, error: t(calendarChangeError(r.code), { detail: r.detail ?? "" }) };
      return {
        ok: true,
        entityTable: "calendar_events",
        entityId: null,
        payload: { deleted: true, title: r.before.title, was: r.before.start },
      };
    }

    case "attach_note": {
      // Link the NOTE to its record — no copy; the record's history reads it.
      const patch: {
        matched_bike_id?: string;
        matched_organization_id?: string;
        matched_contact_id?: string;
      } = {};
      if (action.bikeId) patch.matched_bike_id = action.bikeId;
      if (action.organizationId) patch.matched_organization_id = action.organizationId;
      if (action.contactId) patch.matched_contact_id = action.contactId;
      // A bike says whose it is: the customer comes with it when not named.
      if (action.bikeId && !action.organizationId) {
        const { data: bike } = await supabase
          .from("bikes")
          .select("owner_organization_id")
          .eq("id", action.bikeId)
          .maybeSingle();
        if (bike?.owner_organization_id) patch.matched_organization_id = bike.owner_organization_id;
      }
      const { error } = await supabase.from("inbound_messages").update(patch).eq("id", messageId);
      if (error) return { ok: false, error: t("couldNotSave", { detail: error.message }) };
      if (action.bikeId) safeRevalidate(`/bikes/${action.bikeId}`);
      if (patch.matched_organization_id) safeRevalidate(`/organizations/${patch.matched_organization_id}`);
      return {
        ok: true,
        entityTable: action.bikeId ? "bikes" : action.organizationId ? "organizations" : "contacts",
        entityId: action.bikeId ?? action.organizationId ?? action.contactId,
        payload: {
          number: action.bikeLabel ?? action.organizationLabel ?? action.contactLabel ?? null,
          bikeId: action.bikeId,
          organizationId: patch.matched_organization_id ?? null,
          contactId: action.contactId,
        },
      };
    }

    case "save_contact": {
      const fields: { phone?: string; email?: string } = {};
      if (action.phone) fields.phone = action.phone;
      if (action.email) fields.email = action.email;
      let contactId = action.contactId;
      let orgId: string | null = null;
      let before: { phone: string | null; email: string | null } | null = null;
      if (contactId) {
        const { data: old } = await supabase
          .from("contacts")
          .select("phone, email, organization_id")
          .eq("id", contactId)
          .maybeSingle();
        if (!old) return { ok: false, error: t("contactNotFound") };
        before = { phone: old.phone, email: old.email };
        orgId = old.organization_id;
        const { error } = await supabase.from("contacts").update(fields).eq("id", contactId);
        if (error) return { ok: false, error: t("couldNotSave", { detail: error.message }) };
      } else {
        orgId = filled.customer ?? action.organizationId;
        if (!orgId) return { ok: false, error: t("commandSlotsUnfilled") };
        const [first, ...rest] = (action.name ?? "").trim().split(/\s+/);
        const { data: created, error } = await supabase
          .from("contacts")
          .insert({
            organization_id: orgId,
            ...fields,
            first_name: first || null,
            last_name: rest.join(" ") || null,
            is_primary: false,
          })
          .select("id")
          .single();
        if (error || !created) return { ok: false, error: t("couldNotSave", { detail: error?.message ?? "" }) };
        contactId = created.id;
      }
      // The note now names the person it was about.
      await supabase
        .from("inbound_messages")
        .update({ matched_contact_id: contactId, ...(orgId ? { matched_organization_id: orgId } : {}) })
        .eq("id", messageId);
      if (orgId) safeRevalidate(`/organizations/${orgId}`);
      return {
        ok: true,
        entityTable: "contacts",
        entityId: contactId,
        payload: {
          number: action.contactLabel ?? action.name ?? null,
          organizationId: orgId,
          before,
          after: fields,
          created: !action.contactId,
        },
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

function calendarChangeError(code: string): string {
  return (
    {
      not_configured: "calendarNotConfigured",
      bad_date: "visitNeedsDate",
      bad_time: "visitBadTime",
      not_found: "calendarEntryNotFound",
      provider: "calendarCouldNotChange",
    } as Record<string, string>
  )[code] ?? "calendarCouldNotChange";
}

/**
 * *Act right away* for a NOTE (slice 4): apply its safe suggestions as the
 * SPEAKER, with the speaker's own rights, if they have it switched on
 * (`people.assistant_auto_apply`, set on their person page). Each applied one
 * is marked `auto_applied` in the ledger and shows as such on the card.
 * Which kinds qualify is `autoApplySafe` — deleting never does. Never throws.
 */
export async function autoApplyNote(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  t: Translator,
): Promise<{ applied: number }> {
  const { data: note } = await supabase
    .from("inbound_messages")
    .select("kind, command_plan, handled_by_person_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!note || note.kind !== "note" || !note.handled_by_person_id) return { applied: 0 };
  const { data: speaker } = await supabase
    .from("people")
    .select("assistant_auto_apply, is_active")
    .eq("id", note.handled_by_person_id)
    .maybeSingle();
  if (!speaker?.assistant_auto_apply || !speaker.is_active) return { applied: 0 };
  const access = await loadPersonAccess(supabase, note.handled_by_person_id);
  if (!access) return { applied: 0 };

  let applied = 0;
  for (const action of parseCommandPlan(note.command_plan).actions) {
    if (!autoApplySafe(action)) continue;
    try {
      const r = await applyPlanAction(supabase, messageId, action.id, {}, {
        personId: note.handled_by_person_id,
        caps: access.caps,
        auto: true,
      }, t);
      if (r.ok) applied += 1;
    } catch (e) {
      console.error(`[auto-apply] ${messageId} ${action.id}:`, e);
    }
  }
  return { applied };
}

/** Close a note whose every required suggestion is applied. */
async function closeNoteIfSettled(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  plan: CommandPlan,
  personId: string | null,
): Promise<void> {
  const { data: ledger } = await supabase
    .from("command_actions")
    .select("plan_action_id")
    .eq("message_id", messageId);
  const applied = new Set((ledger ?? []).map((r) => r.plan_action_id as string));
  if (countOpenSuggestions(plan, applied) > 0) return;
  await supabase
    .from("inbound_messages")
    .update({ disposition: "handled", closed_at: new Date().toISOString(), closed_by: personId })
    .eq("id", messageId)
    .neq("disposition", "handled");
}

/** The offer or sales order this message's plan has already drafted, if any. */
async function appliedOrderOf(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
): Promise<{ offerId: string | null; salesOrderId: string | null }> {
  const { data } = await supabase
    .from("command_actions")
    .select("entity_table, entity_id")
    .eq("message_id", messageId)
    .in("entity_table", ["offers", "sales_orders"]);
  const of = (table: string) => data?.find((r) => r.entity_table === table)?.entity_id ?? null;
  return { offerId: of("offers"), salesOrderId: of("sales_orders") };
}

/** Deliveries this message put in the calendar before its order existed now point at it. */
async function linkDeliveriesTo(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  order: { offer_id: string } | { sales_order_id: string },
): Promise<void> {
  const { error } = await supabase
    .from("calendar_events")
    .update(order)
    .eq("message_id", messageId)
    .eq("kind", "delivery")
    .is("offer_id", null)
    .is("sales_order_id", null);
  // The order exists either way; only the calendar's link to it is missing.
  if (error) console.error("[command] linking deliveries to the order failed", error.message);
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
  filled: Record<string, string>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // The person's pick wins — it is how a close spelling, or an existing
  // customer instead of a proposed new one, gets chosen (2026-10-01).
  if (filled.customer) return { ok: true, id: filled.customer };
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
