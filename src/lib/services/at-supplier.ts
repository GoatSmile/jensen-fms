/**
 * Derived "at supplier" state (Tier 2 Phase C / decision D2, generalized by
 * the service remodel).
 *
 * A bike is at-supplier IFF it belongs to a service order whose CURRENT
 * status is `sent` or `at_supplier` (see `AT_SUPPLIER_STATUSES`) AND whose
 * service type `blocks_build` (paint does; a future non-blocking type's
 * orders never gate). There is deliberately NO bike column for this — it's
 * computed from `service_order_bikes` joined to the order's live status, so
 * moving an order to `received_back` frees its frames automatically (they
 * stop matching the set). A bike that is away can't be built; this single
 * helper backs every build gate (finishBikeBuild, bulkMarkBikesBuilt, the
 * build workbench, the /work build queue, the MO bikes section) so the rule
 * lives in exactly one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { one } from "@/lib/supabase/embed";

import { AT_SUPPLIER_STATUSES, type ServiceOrderStatus } from "./status";

/**
 * Returns the subset of `bikeIds` that are currently away at a supplier on a
 * build-blocking service order. Pass a single id (e.g. `[bikeId]`) for a
 * per-bike check, then read `.has(bikeId)`. Empty input → empty set (no
 * query). On query error, returns an empty set (fail-open: a transient
 * lookup must not wedge the build floor — the server actions re-check before
 * consuming inventory anyway).
 */
export async function loadAtSupplierBikeIds(
  supabase: SupabaseClient<Database>,
  bikeIds: string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  if (bikeIds.length === 0) return result;

  const { data, error } = await supabase
    .from("service_order_bikes")
    .select(
      `bike_id,
       service_order:service_orders!service_order_id(
         status,
         service_type:service_types!service_type_id(blocks_build)
       )`,
    )
    .in("bike_id", bikeIds);
  if (error || !data) return result;

  for (const row of data) {
    const order = one(row.service_order);
    if (!order) continue;
    const type = one(order.service_type);
    if (
      type?.blocks_build &&
      AT_SUPPLIER_STATUSES.includes(order.status as ServiceOrderStatus)
    ) {
      result.add(row.bike_id);
    }
  }
  return result;
}

export type PaintStates = {
  /** Away on a build-blocking order that is `sent` / `at_supplier`. */
  atPainter: Set<string>;
  /** Came back from a build-blocking order (`received_back`) and is not away again. */
  painted: Set<string>;
};

/**
 * Paint state for EVERY bike, derived the same way as the gate above — from
 * `service_order_bikes` joined to the order's live status — so "painted" is
 * never a bike column either (DECISIONS 2026-09-01 §5: painted frames are
 * derived state, not inventory). One query, no bike filter: the link table is
 * small and the list page needs the answer for every row it shows. A bike that
 * came back and was sent out again reads as at-painter, not painted. Fail-open
 * like the gate: on error both sets are empty and the list simply shows no
 * paint badges.
 */
export async function loadPaintStates(
  supabase: SupabaseClient<Database>,
): Promise<PaintStates> {
  const atPainter = new Set<string>();
  const painted = new Set<string>();
  const { data, error } = await supabase
    .from("service_order_bikes")
    .select(
      `bike_id,
       service_order:service_orders!service_order_id(
         status,
         service_type:service_types!service_type_id(blocks_build)
       )`,
    );
  if (error || !data) return { atPainter, painted };

  for (const row of data) {
    const order = one(row.service_order);
    if (!order) continue;
    if (!one(order.service_type)?.blocks_build) continue;
    const status = order.status as ServiceOrderStatus;
    if (AT_SUPPLIER_STATUSES.includes(status)) atPainter.add(row.bike_id);
    else if (status === "received_back") painted.add(row.bike_id);
  }
  for (const id of atPainter) painted.delete(id);
  return { atPainter, painted };
}
