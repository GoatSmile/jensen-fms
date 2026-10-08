/**
 * A sales order's delivery in the calendar (migration 122). One per order: the
 * entry may hang on the order itself (its *Add delivery to calendar* button) or
 * on the offer it was converted from (a call drafts the delivery while only a
 * quote exists), and both count. Server-only.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calendarAdapter } from "./client";
import { calendarReady, loadCalendarSettings } from "./settings";

/**
 * The delivery entry already in the calendar for an order — on the order
 * itself, or on the offer it came from. Newest first; null when there is none.
 */
export async function deliveryEntryFor(
  supabase: SupabaseClient,
  soId: string,
  offerId: string | null,
): Promise<{ eventId: string; startsAt: string | null } | null> {
  const or = offerId ? `sales_order_id.eq.${soId},offer_id.eq.${offerId}` : `sales_order_id.eq.${soId}`;
  const { data } = await supabase
    .from("calendar_events")
    .select("external_event_id, starts_at")
    .eq("kind", "delivery")
    .or(or)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  return row ? { eventId: row.external_event_id, startsAt: row.starts_at } : null;
}

/**
 * The same entry, read LIVE from the calendar provider: its real time now —
 * someone may have moved it in Google — or null when it is gone there (the
 * stale link row is then dropped, so the order offers *Add* again).
 */
export async function liveDeliveryEntryFor(
  supabase: SupabaseClient,
  soId: string,
  offerId: string | null,
): Promise<{ eventId: string; start: string | null; allDay: boolean } | null> {
  const link = await deliveryEntryFor(supabase, soId, offerId);
  if (!link) return null;
  const settings = await loadCalendarSettings(supabase);
  const adapter = calendarAdapter(settings.provider);
  // No provider reachable: fall back to the copy taken at creation.
  if (!calendarReady(settings) || !adapter) return { eventId: link.eventId, start: link.startsAt, allDay: false };
  const r = await adapter.getEvent(settings.calendarId, link.eventId);
  // Gone in the provider: not found, or deleted there (kept as cancelled).
  // Any other failure (auth, network) is NOT "gone" — keep the link.
  const gone = r.ok ? r.value.cancelled === true : /Google (404|410)\b/.test(r.error);
  if (gone) {
    await supabase.from("calendar_events").delete().eq("external_event_id", link.eventId);
    return null;
  }
  if (!r.ok) return { eventId: link.eventId, start: link.startsAt, allDay: false };
  return { eventId: link.eventId, start: r.value.start || null, allDay: r.value.allDay };
}
