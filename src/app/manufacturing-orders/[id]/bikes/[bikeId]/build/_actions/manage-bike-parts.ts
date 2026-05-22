"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type BikePartsResult = { ok: true } | { ok: false; error: string };

/**
 * Per-bike parts list lives in `bike_parts`. It's the source of truth for
 * what got consumed when a specific bike was built; the MO recipe
 * (`manufacturing_order_parts`) is just the default we copy from when the
 * tech opens the workbench for the first time on a bike.
 *
 * Edit semantics:
 *   - Allowed when bike status is planning / building (pre-build).
 *   - Once finishBikeBuild stamps the inventory_movement_id on each row and
 *     transitions to in_stock, rows are effectively frozen.
 */

async function assertBikeEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bikeId: string,
  moId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: bike, error } = await supabase
    .from("bikes")
    .select("id, status, manufacturing_order_id")
    .eq("id", bikeId)
    .maybeSingle();
  if (error || !bike) {
    return {
      ok: false,
      error: `Could not load bike: ${error?.message ?? "not found"}`,
    };
  }
  if (bike.manufacturing_order_id !== moId) {
    return { ok: false, error: "That bike doesn't belong to this MO." };
  }
  if (bike.status !== "planning" && bike.status !== "building") {
    return {
      ok: false,
      error: `Parts can only be edited while the bike is in planning or building. Current: ${bike.status}.`,
    };
  }
  return { ok: true };
}

/**
 * Lazy-populate `bike_parts` from the MO recipe. Idempotent: if any rows
 * already exist for the bike, this is a no-op. Use case: tech opens the
 * workbench for a fresh bike and wants the recipe as a starting point.
 *
 * Also used by markBikeBuilt + bulkMarkBuilt so the legacy bulk path
 * produces consistent per-bike records.
 */
export async function copyMoRecipeToBike(
  moId: string,
  bikeId: string,
): Promise<BikePartsResult> {
  if (!moId || !bikeId) {
    return { ok: false, error: "Missing MO id or bike id." };
  }

  const supabase = await createClient();
  const guard = await assertBikeEditable(supabase, bikeId, moId);
  if (!guard.ok) return guard;

  // Idempotent: skip if any parts already exist on the bike.
  const { count: existingCount } = await supabase
    .from("bike_parts")
    .select("id", { count: "exact", head: true })
    .eq("bike_id", bikeId);
  if ((existingCount ?? 0) > 0) {
    return { ok: true };
  }

  const { data: recipe, error: recipeErr } = await supabase
    .from("manufacturing_order_parts")
    .select("part_id, quantity_per_bike, notes")
    .eq("manufacturing_order_id", moId);
  if (recipeErr) {
    return {
      ok: false,
      error: `Could not load MO recipe: ${recipeErr.message}`,
    };
  }
  if (!recipe || recipe.length === 0) {
    return { ok: true }; // empty MO, nothing to copy
  }

  const now = new Date().toISOString();
  const rows = recipe.map((r) => ({
    bike_id: bikeId,
    part_id: r.part_id,
    quantity: Number(r.quantity_per_bike),
    notes: r.notes,
    installed_at: now,
  }));

  const { error: insErr } = await supabase.from("bike_parts").insert(rows);
  if (insErr) {
    return { ok: false, error: `Could not copy recipe: ${insErr.message}` };
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}

/**
 * Add a single part to this specific bike. Used by the workbench picker.
 * Defaults qty to 1; user edits inline.
 */
export async function addBikePart(
  moId: string,
  bikeId: string,
  partId: string,
  qty: number,
): Promise<BikePartsResult> {
  if (!moId || !bikeId || !partId) {
    return { ok: false, error: "Missing MO id, bike id, or part id." };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be positive." };
  }

  const supabase = await createClient();
  const guard = await assertBikeEditable(supabase, bikeId, moId);
  if (!guard.ok) return guard;

  // Don't allow duplicate part_id on the same bike — qty should be edited
  // on the existing row instead.
  const { data: existing } = await supabase
    .from("bike_parts")
    .select("id")
    .eq("bike_id", bikeId)
    .eq("part_id", partId)
    .is("removed_at", null)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: "That part is already on this bike. Edit its quantity instead.",
    };
  }

  const { error: insErr } = await supabase.from("bike_parts").insert({
    bike_id: bikeId,
    part_id: partId,
    quantity: qty,
    installed_at: new Date().toISOString(),
  });
  if (insErr) {
    return { ok: false, error: `Could not add part: ${insErr.message}` };
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}

/**
 * Update the quantity on a per-bike row. Allowed only pre-build (status
 * planning/building) and only on rows without an inventory_movement_id —
 * if a movement already exists, the consumption has been recorded and
 * the qty is frozen for accounting consistency.
 */
export async function updateBikePartQuantity(
  moId: string,
  bikeId: string,
  rowId: string,
  qty: number,
): Promise<BikePartsResult> {
  if (!moId || !bikeId || !rowId) {
    return { ok: false, error: "Missing identifiers." };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be positive." };
  }

  const supabase = await createClient();
  const guard = await assertBikeEditable(supabase, bikeId, moId);
  if (!guard.ok) return guard;

  const { data: row, error: lookupErr } = await supabase
    .from("bike_parts")
    .select("id, bike_id, quantity, inventory_movement_id")
    .eq("id", rowId)
    .maybeSingle();
  if (lookupErr || !row) {
    return {
      ok: false,
      error: `Could not load row: ${lookupErr?.message ?? "not found"}`,
    };
  }
  if (row.bike_id !== bikeId) {
    return { ok: false, error: "That row doesn't belong to this bike." };
  }
  if (row.inventory_movement_id != null) {
    return {
      ok: false,
      error: "Cannot change qty: inventory already consumed for this row.",
    };
  }
  if (Number(row.quantity) === qty) return { ok: true };

  const { error: updErr } = await supabase
    .from("bike_parts")
    .update({ quantity: qty })
    .eq("id", rowId);
  if (updErr) {
    return { ok: false, error: `Could not update qty: ${updErr.message}` };
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}

/**
 * Remove a part from this bike's list. Same gate as updateBikePartQuantity —
 * only allowed when the row has no inventory_movement_id (pre-consumption).
 */
export async function removeBikePart(
  moId: string,
  bikeId: string,
  rowId: string,
): Promise<BikePartsResult> {
  if (!moId || !bikeId || !rowId) {
    return { ok: false, error: "Missing identifiers." };
  }

  const supabase = await createClient();
  const guard = await assertBikeEditable(supabase, bikeId, moId);
  if (!guard.ok) return guard;

  const { data: row, error: lookupErr } = await supabase
    .from("bike_parts")
    .select("id, bike_id, inventory_movement_id")
    .eq("id", rowId)
    .maybeSingle();
  if (lookupErr || !row) {
    return {
      ok: false,
      error: `Could not load row: ${lookupErr?.message ?? "not found"}`,
    };
  }
  if (row.bike_id !== bikeId) {
    return { ok: false, error: "That row doesn't belong to this bike." };
  }
  if (row.inventory_movement_id != null) {
    return {
      ok: false,
      error: "Cannot remove: inventory already consumed for this row.",
    };
  }

  const { error: delErr } = await supabase
    .from("bike_parts")
    .delete()
    .eq("id", rowId);
  if (delErr) {
    return { ok: false, error: `Could not remove: ${delErr.message}` };
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}
