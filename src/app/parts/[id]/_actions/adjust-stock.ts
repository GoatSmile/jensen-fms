"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type AdjustStockInput = {
  partId: string;
  locationId: string;
  mode: "delta" | "set";
  /** Signed delta (mode='delta') or absolute target (mode='set'). */
  value: number;
  reason: string;
  /** Optional landed-cost-per-unit in DKK; only meaningful when adding stock. */
  unitCostDkk: number | null;
};

export type AdjustStockResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Append a single `inventory_movements` row of type `adjustment`.
 *
 * The current on-hand for the (part, location) is read first so we can
 *   - translate `mode='set'` into a signed delta, and
 *   - reject adjustments that would drive on-hand negative.
 *
 * There is a small read-then-write race: another adjustment landing between
 * those two steps could let us write a delta that's stale by the time it lands.
 * For a single-shop FMS this is acceptable; correcting drift is itself just
 * another adjustment. When multi-user concurrency arrives, push this into a
 * Postgres function so the read and write happen atomically.
 *
 * Uses the publishable-key Supabase client. RLS is deferred (per CLAUDE.md);
 * once it lands, this action will need either a service-role client or an
 * authenticated session.
 */
export async function adjustStock(
  input: AdjustStockInput,
): Promise<AdjustStockResult> {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: "Reason is required for stock adjustments." };
  }
  if (!Number.isFinite(input.value)) {
    return { ok: false, error: "Quantity must be a number." };
  }
  if (input.unitCostDkk != null && !Number.isFinite(input.unitCostDkk)) {
    return { ok: false, error: "Unit cost must be a number or empty." };
  }

  const supabase = await createClient();

  // Read current on-hand at this location. v_current_stock has at most one row
  // per (part, location); when there's no movement history yet the view simply
  // returns nothing — that's a starting balance of zero.
  const { data: stockRow, error: stockErr } = await supabase
    .from("v_current_stock")
    .select("quantity_on_hand")
    .eq("part_id", input.partId)
    .eq("location_id", input.locationId)
    .maybeSingle();

  if (stockErr) {
    return { ok: false, error: `Could not read current stock: ${stockErr.message}` };
  }

  const currentOnHand = Number(stockRow?.quantity_on_hand ?? 0);

  let delta: number;
  if (input.mode === "delta") {
    delta = input.value;
  } else {
    // mode === 'set'
    if (input.value < 0) {
      return { ok: false, error: "Target on-hand cannot be negative." };
    }
    delta = input.value - currentOnHand;
  }

  if (delta === 0) {
    return {
      ok: false,
      error:
        "This adjustment would not change the count. Cancel instead, or change the value.",
    };
  }

  const projected = currentOnHand + delta;
  if (projected < 0) {
    return {
      ok: false,
      error: `Adjustment would result in ${projected} on hand. On-hand cannot go below zero.`,
    };
  }

  const { error: insertErr } = await supabase.from("inventory_movements").insert({
    part_id: input.partId,
    location_id: input.locationId,
    movement_type: "adjustment",
    quantity_delta: delta,
    unit_cost_dkk: input.unitCostDkk ?? null,
    reason,
  });

  if (insertErr) {
    return { ok: false, error: `Could not write adjustment: ${insertErr.message}` };
  }

  // The list page summarises stock; the detail page reads movements + stock.
  revalidatePath("/parts");
  revalidatePath(`/parts/${input.partId}`);

  return { ok: true };
}
