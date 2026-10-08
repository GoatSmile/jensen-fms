"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { deliveryEntryFor } from "@/lib/calendar/deliveries";
import { createCalendarEntry, deleteCalendarEntry, moveCalendarEntry } from "@/lib/calendar/entries";
import { appOrigin } from "@/lib/qr";
import { inheritTestTitle } from "@/lib/test-marker";
import { createServiceClient } from "@/lib/supabase/service";

export type CalendarDeliveryResult =
  | { ok: true; eventId: string; date: string; time: string | null }
  | { ok: false; error: string };

/** The order statuses whose delivery may go in the calendar: agreed, not yet handed over. */
const CALENDAR_STATUSES = ["confirmed", "in_production", "ready"];

/**
 * Put an order's delivery in the calendar (owner, 2026-10-07: "calendar events
 * everywhere"). A person presses it — nothing is put in by itself — and it goes
 * through `createCalendarEntry` like every other entry. One delivery per order:
 * an entry already linked to the order, or to the offer it was converted from
 * (a call drafts the delivery against the offer), refuses a second.
 */
export async function addSODeliveryToCalendar(
  soId: string,
  input: { date: string; time: string; durationMinutes: number | null },
): Promise<CalendarDeliveryResult> {
  const t = await getTranslations("errors");
  const tSo = await getTranslations("soDelivery");
  if (!(await readHasCapability("so"))) {
    return { ok: false, error: t("deliveryNeedsSo") };
  }
  const supabase = createServiceClient();
  const { data: so } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, status, delivery_address, converted_from_offer_id, organization_id, notes,
       organization:organizations!organization_id(legal_name, display_name_da, display_name_en, address_line1, zip_code, city),
       organization_unit:organization_units!organization_unit_id(name, address)`,
    )
    .eq("id", soId)
    .maybeSingle();
  if (!so) return { ok: false, error: t("notFound") };
  if (!CALENDAR_STATUSES.includes(so.status)) {
    return { ok: false, error: t("deliveryCalendarStatus") };
  }

  const existing = await deliveryEntryFor(supabase, so.id, so.converted_from_offer_id);
  if (existing) return { ok: false, error: t("deliveryAlreadyInCalendar") };

  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("quantity, bike_template_id")
    .eq("sales_order_id", so.id);
  const bikes = (lines ?? [])
    .filter((l) => l.bike_template_id)
    .reduce((n, l) => n + Number(l.quantity ?? 0), 0);

  const org = so.organization as
    | { legal_name: string; display_name_da: string | null; display_name_en: string | null; address_line1: string | null; zip_code: string | null; city: string | null }
    | null;
  const unit = so.organization_unit as { name: string | null; address: string | null } | null;
  const customer = org ? org.display_name_da || org.display_name_en || org.legal_name : "";
  // Customer + errand only — never a contact's name or phone (CLAUDE.md).
  const errand = bikes > 0
    ? tSo("calendarTitleBikes", { number: so.sales_order_number, count: bikes })
    : tSo("calendarTitle", { number: so.sales_order_number });
  // A TEST order's entry wears the marker too (inheritTestTitle).
  const title = inheritTestTitle(so.notes, [customer, errand].filter(Boolean).join(" — "));
  const location =
    so.delivery_address ??
    unit?.address ??
    ([org?.address_line1, [org?.zip_code, org?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null);

  const r = await createCalendarEntry(supabase, {
    kind: "delivery",
    title,
    description: `${tSo("calendarLink")}: ${appOrigin()}/sales-orders/${so.id}`,
    location,
    date: input.date,
    time: input.time.trim() || null,
    durationMinutes: input.durationMinutes,
    organizationId: so.organization_id,
    salesOrderId: so.id,
    createdBy: await readPersonId(),
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
  revalidatePath(`/sales-orders/${so.id}`);
  revalidatePath("/calendar");
  return { ok: true, eventId: r.event.id, date: input.date, time: input.time.trim() || null };
}

export type ChangeDeliveryResult = { ok: true } | { ok: false; error: string };

/** The calendar change's failure, in the person's words. */
function changeError(
  t: Awaited<ReturnType<typeof getTranslations>>,
  code: string,
  detail: string | undefined,
): string {
  const key =
    (
      {
        not_configured: "calendarNotConfigured",
        bad_date: "visitNeedsDate",
        bad_time: "visitBadTime",
        not_found: "calendarEntryNotFound",
      } as Record<string, string>
    )[code] ?? "calendarCouldNotChange";
  return t(key, { detail: detail ?? "" });
}

/** The order (for its offer link) and its delivery entry — or why not. */
async function orderEntry(soId: string) {
  const supabase = createServiceClient();
  const { data: so } = await supabase
    .from("sales_orders")
    .select("id, status, converted_from_offer_id")
    .eq("id", soId)
    .maybeSingle();
  if (!so) return { supabase, so: null, entry: null };
  return { supabase, so, entry: await deliveryEntryFor(supabase, so.id, so.converted_from_offer_id) };
}

/**
 * MOVE the order's delivery in the calendar — a changed delivery date no
 * longer leaves its entry on the old day (BACKLOG, closed 2026-10-08). Same
 * door as a note's move (`moveCalendarEntry`): the entry keeps its title and
 * length; an emptied time makes it all-day.
 */
export async function moveSODelivery(
  soId: string,
  input: { date: string; time: string },
): Promise<ChangeDeliveryResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("so"))) return { ok: false, error: t("deliveryNeedsSo") };
  const { supabase, so, entry } = await orderEntry(soId);
  if (!so) return { ok: false, error: t("notFound") };
  if (!CALENDAR_STATUSES.includes(so.status)) return { ok: false, error: t("deliveryCalendarStatus") };
  if (!entry) return { ok: false, error: t("calendarEntryNotFound", { detail: "" }) };
  const r = await moveCalendarEntry(supabase, {
    eventId: entry.eventId,
    date: input.date,
    time: input.time.trim() || null,
    durationMinutes: null,
  });
  if (!r.ok) return { ok: false, error: changeError(t, r.code, r.detail) };
  revalidatePath(`/sales-orders/${so.id}`);
  revalidatePath("/calendar");
  return { ok: true };
}

/**
 * REMOVE the order's delivery from the calendar (the page asks first). Also
 * open to a CANCELLED order, whose delivery will not happen. The order then
 * offers *Add delivery to calendar* again.
 */
export async function removeSODelivery(soId: string): Promise<ChangeDeliveryResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("so"))) return { ok: false, error: t("deliveryNeedsSo") };
  const { supabase, so, entry } = await orderEntry(soId);
  if (!so) return { ok: false, error: t("notFound") };
  if (!CALENDAR_STATUSES.includes(so.status) && so.status !== "cancelled") {
    return { ok: false, error: t("deliveryCalendarStatus") };
  }
  if (!entry) return { ok: false, error: t("calendarEntryNotFound", { detail: "" }) };
  const r = await deleteCalendarEntry(supabase, entry.eventId);
  if (!r.ok) return { ok: false, error: changeError(t, r.code, r.detail) };
  revalidatePath(`/sales-orders/${so.id}`);
  revalidatePath("/calendar");
  return { ok: true };
}
