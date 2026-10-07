/**
 * A sales order's delivery in the calendar (migration 122). One per order: the
 * entry may hang on the order itself (its *Add delivery to calendar* button) or
 * on the offer it was converted from (a call drafts the delivery while only a
 * quote exists), and both count. Server-only.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
