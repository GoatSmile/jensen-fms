import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Where a unit cost came from. Mirrors the `unit_cost_basis` enum
 * (migration 88) — see that file's header for the reasoning.
 */
export type UnitCostBasis = "purchase" | "stated" | "derived" | "none";

export type ResolvedUnitCost = {
  /** DKK per unit, or null when nothing in the system knows yet. */
  costDkk: number | null;
  basis: UnitCostBasis;
};

export const UNKNOWN_UNIT_COST: ResolvedUnitCost = {
  costDkk: null,
  basis: "none",
};

/**
 * What one unit of a part is currently reckoned to cost us.
 *
 * ONE resolver for every consumption path, so the build workbench, work orders
 * and stock adjustments cannot disagree about what a part is worth. Reads
 * `v_part_last_cost`, which since migration 88 considers costed inbound
 * MOVEMENTS as well as purchase-order lines — most recent wins, whatever its
 * basis. Stock found in storage and priced by hand therefore costs a build
 * correctly instead of silently costing nothing.
 *
 * Callers going OUTBOUND (consumption, write-off, count-down) should record the
 * result as `derived`: stock leaving the shelf inherits the prevailing cost, it
 * does not get revalued. Nobody should be asked what a broken part was worth.
 */
export async function resolveUnitCosts(
  supabase: SupabaseServerClient,
  partIds: string[],
): Promise<Map<string, ResolvedUnitCost>> {
  const out = new Map<string, ResolvedUnitCost>();
  const ids = [...new Set(partIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data } = await supabase
    .from("v_part_last_cost")
    .select("part_id, last_cost_dkk, last_cost_basis")
    .in("part_id", ids);

  for (const row of data ?? []) {
    if (!row.part_id || row.last_cost_dkk == null) continue;
    out.set(row.part_id, {
      costDkk: Number(row.last_cost_dkk),
      // The stored basis describes where the number was FIRST established.
      // Consumption inherits the number, so the movement it writes is
      // `derived` regardless — that is the caller's job, not ours.
      basis: (row.last_cost_basis as UnitCostBasis | null) ?? "stated",
    });
  }
  return out;
}

/** Single-part convenience over {@link resolveUnitCosts}. */
export async function resolveUnitCost(
  supabase: SupabaseServerClient,
  partId: string,
): Promise<ResolvedUnitCost> {
  const map = await resolveUnitCosts(supabase, [partId]);
  return map.get(partId) ?? UNKNOWN_UNIT_COST;
}

/**
 * The (cost, basis) pair to stamp on an OUTBOUND movement for a part. Null cost
 * carries basis `none`, which is what the audit invariant and the build-gate
 * warning look for.
 */
export function outboundCostFields(resolved: ResolvedUnitCost | undefined): {
  unit_cost_dkk: number | null;
  unit_cost_basis: UnitCostBasis;
} {
  const costDkk = resolved?.costDkk ?? null;
  return {
    unit_cost_dkk: costDkk,
    unit_cost_basis: costDkk == null ? "none" : "derived",
  };
}
