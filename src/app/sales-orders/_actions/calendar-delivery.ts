"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { deliveryEntryFor } from "@/lib/calendar/deliveries";
import { createCalendarEntry } from "@/lib/calendar/entries";
import { appOrigin } from "@/lib/qr";
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
      `id, sales_order_number, status, delivery_address, converted_from_offer_id, organization_id,
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
  const title = [customer, errand].filter(Boolean).join(" — ");
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
