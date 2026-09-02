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

import {
  loadPaintedStockLookup,
  paintedByPartFor,
} from "@/lib/parts/painted-variants";

export type CoverageRow = {
  partId: string;
  sku: string;
  name: string;
  perBike: number;
  /** perBike × remainingToBuild */
  demand: number;
  /** Raw on hand, plus painted on hand in the MO's colour for a paintable part. */
  onHand: number;
  /** max(0, demand − onHand) */
  shortfall: number;
  /** Painted variant on hand in the MO's colour (0 for a non-paintable part). */
  paintedOnHand: number;
  /** Of the covered demand, how many units are covered only by RAW parts that
   * still have to go to the painter (0 when the part is not paintable). */
  needsPaint: number;
};

export type MOCoverage = {
  remainingToBuild: number;
  rows: CoverageRow[];
  shortfallRows: CoverageRow[];
};

const PRE_BUILD_STATUSES = ["planning", "building"];

/**
 * Soft-deleted parts are skipped: they can't be stocked or ordered, so
 * counting them would show a phantom, unactionable shortage. Historical MO
 * recipes keep such rows (frozen history — e.g. the retired JP-lak paint
 * SKUs); the parts list still shows them, only the demand math ignores them.
 */
export function computeCoverageRows(
  recipe: {
    partId: string;
    sku: string;
    name: string;
    perBike: number;
    deleted?: boolean;
  }[],
  remainingToBuild: number,
  stockByPart: Map<string, number>,
  /**
   * Painted stock in the MO's colour per RAW part id, with an entry for EVERY
   * paintable recipe part (0 when no variant exists) — membership is what marks
   * a part paintable (docs/plan-painted-parts.md). Absent = colour-blind.
   */
  paintedByPart?: Map<string, number>,
): CoverageRow[] {
  return recipe
    .filter((r) => !r.deleted)
    .map((r) => {
      const demand = r.perBike * remainingToBuild;
      const raw = stockByPart.get(r.partId) ?? 0;
      // Only PAINTABLE parts appear in the map (the caller builds it from the
      // catalogue's paintable set); everything else is colour-blind.
      const paintable = paintedByPart?.has(r.partId) ?? false;
      const painted = paintable ? (paintedByPart?.get(r.partId) ?? 0) : 0;
      const onHand = raw + painted;
      // Painted covers first; what raw then covers still has to be painted.
      const coveredByRaw = Math.max(0, Math.min(raw, demand - painted));
      return {
        ...r,
        demand,
        onHand,
        shortfall: Math.max(0, demand - onHand),
        paintedOnHand: painted,
        needsPaint: paintable ? coveredByRaw : 0,
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
 * Self-contained loader used by the draft-PO action and by the spawn-MO paint
 * prompt (the MO detail page computes the same thing from data it already has
 * on hand).
 *
 * COLOUR-AWARE since the paint prompt: painted stock in the MO's colour covers
 * demand first, so a frame already painted is neither re-purchased by the
 * draft PO nor counted as needing paint. Before this it was colour-blind and
 * overstated the shortfall by whatever the shelf already held painted.
 */
export async function loadMOCoverage(
  supabase: SupabaseClient,
  moId: string,
): Promise<MOCoverage | { error: string }> {
  const [moRes, bikesRes, recipeRes, stockRes] = await Promise.all([
    supabase
      .from("manufacturing_orders")
      .select("id, target_quantity, color_id")
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
        "part_id, quantity_per_bike, part:parts!part_id(internal_sku, name_en, deleted_at)",
      )
      .eq("manufacturing_order_id", moId),
    supabase.from("v_current_stock").select("part_id, quantity_on_hand"),
  ]);

  if (moRes.error || !moRes.data) {
    return {
      error: `Could not load MO: ${moRes.error?.message ?? "not found"}`,
    };
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
      deleted: part?.deleted_at != null,
    };
  });

  const colorId = moRes.data.color_id;
  const paintedByPart = colorId
    ? paintedByPartFor(
        await loadPaintedStockLookup(supabase),
        colorId,
        recipe.map((r) => r.partId),
      )
    : undefined;

  const rows = computeCoverageRows(
    recipe,
    remainingToBuild,
    stockByPart,
    paintedByPart,
  );
  return {
    remainingToBuild,
    rows,
    shortfallRows: rows.filter((r) => r.shortfall > 0),
  };
}
