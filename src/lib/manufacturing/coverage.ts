/**
 * MO stock coverage: recipe × bikes-still-to-build vs current stock.
 *
 * "Still to build" counts attached bikes in pre-build statuses
 * (planning/building) PLUS unfilled slots (target − attached): both still
 * need parts pulled from inventory. Coverage is per-MO and does not model
 * competition between MOs for the same stock — at this scale the planner
 * resolves that by eye.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CoverageRow = {
  partId: string;
  sku: string;
  name: string;
  perBike: number;
  /** perBike × remainingToBuild */
  demand: number;
  onHand: number;
  /** max(0, demand − onHand) */
  shortfall: number;
};

export type MOCoverage = {
  remainingToBuild: number;
  rows: CoverageRow[];
  shortfallRows: CoverageRow[];
};

const PRE_BUILD_STATUSES = ["planning", "building"];

/**
 * Paint ("Lakering") service SKUs — `JP-lak*` by convention (see CLAUDE.md).
 * They live in `parts` for paint-order costing but never accumulate
 * inventory movements, so stock coverage would flag them as perpetually
 * short and draft POs would try to "buy paint". Excluded from coverage;
 * paint capacity is the paint-order workflow's concern.
 */
export function isServiceSku(sku: string): boolean {
  return sku.toLowerCase().startsWith("jp-lak");
}

export function computeCoverageRows(
  recipe: { partId: string; sku: string; name: string; perBike: number }[],
  remainingToBuild: number,
  stockByPart: Map<string, number>,
): CoverageRow[] {
  return recipe
    .filter((r) => !isServiceSku(r.sku))
    .map((r) => {
      const demand = r.perBike * remainingToBuild;
      const onHand = stockByPart.get(r.partId) ?? 0;
      return {
        ...r,
        demand,
        onHand,
        shortfall: Math.max(0, demand - onHand),
      };
    })
    .sort((a, b) => b.shortfall - a.shortfall || a.sku.localeCompare(b.sku));
}

/** Bikes that still need parts: pre-build attached bikes + unfilled slots. */
export function remainingToBuildCount(args: {
  targetQuantity: number;
  bikeStatuses: string[];
}): number {
  const attached = args.bikeStatuses.length;
  const preBuild = args.bikeStatuses.filter((s) =>
    PRE_BUILD_STATUSES.includes(s),
  ).length;
  const unfilledSlots = Math.max(0, args.targetQuantity - attached);
  return preBuild + unfilledSlots;
}

/**
 * Self-contained loader used by the draft-PO action (the MO detail page
 * computes the same thing from data it already has on hand).
 */
export async function loadMOCoverage(
  supabase: SupabaseClient,
  moId: string,
): Promise<MOCoverage | { error: string }> {
  const [moRes, bikesRes, recipeRes, stockRes] = await Promise.all([
    supabase
      .from("manufacturing_orders")
      .select("id, target_quantity")
      .eq("id", moId)
      .maybeSingle(),
    supabase
      .from("bikes")
      .select("status")
      .eq("manufacturing_order_id", moId)
      .is("deleted_at", null),
    supabase
      .from("manufacturing_order_parts")
      .select(
        "part_id, quantity_per_bike, part:parts!part_id(internal_sku, name_en)",
      )
      .eq("manufacturing_order_id", moId),
    supabase.from("v_current_stock").select("part_id, quantity_on_hand"),
  ]);

  if (moRes.error || !moRes.data) {
    return { error: `Could not load MO: ${moRes.error?.message ?? "not found"}` };
  }

  const stockByPart = new Map<string, number>();
  for (const row of stockRes.data ?? []) {
    if (!row.part_id) continue;
    stockByPart.set(
      row.part_id,
      (stockByPart.get(row.part_id) ?? 0) + Number(row.quantity_on_hand ?? 0),
    );
  }

  const remainingToBuild = remainingToBuildCount({
    targetQuantity: moRes.data.target_quantity,
    bikeStatuses: (bikesRes.data ?? []).map((b) => b.status as string),
  });

  const recipe = (recipeRes.data ?? []).map((r) => {
    const part = Array.isArray(r.part) ? r.part[0] : r.part;
    return {
      partId: r.part_id as string,
      sku: (part?.internal_sku as string) ?? "—",
      name: (part?.name_en as string) ?? "—",
      perBike: Number(r.quantity_per_bike),
    };
  });

  const rows = computeCoverageRows(recipe, remainingToBuild, stockByPart);
  return {
    remainingToBuild,
    rows,
    shortfallRows: rows.filter((r) => r.shortfall > 0),
  };
}
