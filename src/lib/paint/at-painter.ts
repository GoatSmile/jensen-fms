/**
 * Derived "at painter" state (Tier 2 Phase C / decision D2).
 *
 * A bike is at-painter IFF it belongs to a `paint_order` whose CURRENT status
 * is `sent_to_painter` or `at_painter` (see `AT_PAINTER_STATUSES`). There is
 * deliberately NO bike column for this — it's computed from `paint_order_bikes`
 * joined to the order's live status, so moving an order to `received_back`
 * frees its frames automatically (they stop matching the set). A bike that is
 * at the painter can't be built; this single helper backs every build gate
 * (finishBikeBuild, bulkMarkBikesBuilt, the build workbench, the /work build
 * queue, the MO bikes section) so the rule lives in exactly one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import { AT_PAINTER_STATUSES, type PaintOrderStatus } from "./status";

/**
 * Returns the subset of `bikeIds` that are currently at the painter. Pass a
 * single id (e.g. `[bikeId]`) for a per-bike check, then read `.has(bikeId)`.
 * Empty input → empty set (no query). On query error, returns an empty set
 * (fail-open: a transient paint lookup must not wedge the build floor — the
 * server actions re-check before consuming inventory anyway).
 */
export async function loadAtPainterBikeIds(
  supabase: SupabaseClient<Database>,
  bikeIds: string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  if (bikeIds.length === 0) return result;

  const { data, error } = await supabase
    .from("paint_order_bikes")
    .select("bike_id, paint_order:paint_orders!paint_order_id(status)")
    .in("bike_id", bikeIds);
  if (error || !data) return result;

  for (const row of data) {
    const po = Array.isArray(row.paint_order)
      ? row.paint_order[0]
      : row.paint_order;
    if (po && AT_PAINTER_STATUSES.includes(po.status as PaintOrderStatus)) {
      result.add(row.bike_id);
    }
  }
  return result;
}
