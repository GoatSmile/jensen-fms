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
    const order = Array.isArray(row.service_order)
      ? row.service_order[0]
      : row.service_order;
    if (!order) continue;
    const type = Array.isArray(order.service_type)
      ? order.service_type[0]
      : order.service_type;
    if (
      type?.blocks_build &&
      AT_SUPPLIER_STATUSES.includes(order.status as ServiceOrderStatus)
    ) {
      result.add(row.bike_id);
    }
  }
  return result;
}
