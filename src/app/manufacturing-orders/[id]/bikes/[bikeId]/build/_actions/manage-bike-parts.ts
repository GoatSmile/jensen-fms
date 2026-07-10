"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";

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

  // Soft-deleted parts on the recipe are frozen history (e.g. retired JP-lak
  // rows) — copying them would resurrect a retired part into bike_parts and
  // finishBikeBuild would then consume it into the ledger.
  const { data: recipeRows, error: recipeErr } = await supabase
    .from("manufacturing_order_parts")
    .select("part_id, quantity_per_bike, notes, part:parts!part_id(deleted_at)")
    .eq("manufacturing_order_id", moId);
  if (recipeErr) {
    return {
      ok: false,
      error: `Could not load MO recipe: ${recipeErr.message}`,
    };
  }
  const recipe = (recipeRows ?? []).filter(
    (r) => one(r.part)?.deleted_at == null,
  );
  if (recipe.length === 0) {
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

export type BikeKitAddResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string };

/**
 * "Add a whole kit" to this bike: insert every live part carrying the kit
 * label that isn't already on the bike, qty 1. Parts already present are
 * skipped (counted, not errored). Per-bike mirror of addKitPartsToMO.
 */
export async function bulkAddPartsByKit(
  moId: string,
  bikeId: string,
  kitId: string,
): Promise<BikeKitAddResult> {
  if (!moId || !bikeId || !kitId) {
    return { ok: false, error: "Missing MO id, bike id, or kit id." };
  }

  const supabase = await createClient();
  const guard = await assertBikeEditable(supabase, bikeId, moId);
  if (!guard.ok) return guard;

  const [membershipsRes, existingRes] = await Promise.all([
    supabase
      .from("part_kits")
      .select("part_id, part:parts!part_id(id, deleted_at)")
      .eq("kit_id", kitId),
    supabase
      .from("bike_parts")
      .select("part_id")
      .eq("bike_id", bikeId)
      .is("removed_at", null),
  ]);
  if (membershipsRes.error) {
    return {
      ok: false,
      error: `Could not load kit parts: ${membershipsRes.error.message}`,
    };
  }

  const already = new Set((existingRes.data ?? []).map((r) => r.part_id));
  const livePartIds: string[] = [];
  let skipped = 0;
  for (const m of membershipsRes.data ?? []) {
    const part = Array.isArray(m.part) ? m.part[0] : m.part;
    if (!part || part.deleted_at != null) continue;
    if (already.has(m.part_id)) skipped += 1;
    else livePartIds.push(m.part_id);
  }
  if (livePartIds.length === 0) {
    return { ok: true, added: 0, skipped };
  }

  const now = new Date().toISOString();
  const { error: insErr } = await supabase.from("bike_parts").insert(
    livePartIds.map((part_id) => ({
      bike_id: bikeId,
      part_id,
      quantity: 1,
      installed_at: now,
    })),
  );
  if (insErr) {
    return { ok: false, error: `Could not add kit parts: ${insErr.message}` };
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true, added: livePartIds.length, skipped };
}

export type BikePartsClearResult =
  | { ok: true; removed: number; kept: number }
  | { ok: false; error: string };

/**
 * Clear the build: delete every not-yet-consumed part from this bike. Rows
 * already linked to an inventory movement are frozen and kept (reported as
 * `kept`). Use case: tech wants to start the parts list over.
 */
export async function clearBikeBuildParts(
  moId: string,
  bikeId: string,
): Promise<BikePartsClearResult> {
  if (!moId || !bikeId) {
    return { ok: false, error: "Missing MO id or bike id." };
  }

  const supabase = await createClient();
  const guard = await assertBikeEditable(supabase, bikeId, moId);
  if (!guard.ok) return guard;

  const { data: partRows, error: loadErr } = await supabase
    .from("bike_parts")
    .select("id, inventory_movement_id")
    .eq("bike_id", bikeId)
    .is("removed_at", null);
  if (loadErr) {
    return { ok: false, error: `Could not load parts: ${loadErr.message}` };
  }

  const removableIds = (partRows ?? [])
    .filter((r) => r.inventory_movement_id == null)
    .map((r) => r.id);
  const kept = (partRows ?? []).length - removableIds.length;
  if (removableIds.length === 0) {
    return { ok: true, removed: 0, kept };
  }

  const { error: delErr } = await supabase
    .from("bike_parts")
    .delete()
    .in("id", removableIds);
  if (delErr) {
    return { ok: false, error: `Could not clear build: ${delErr.message}` };
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true, removed: removableIds.length, kept };
}

export type BikeKitRemoveResult =
  | { ok: true; removed: number; kept: number }
  | { ok: false; error: string };

/**
 * Remove a whole kit from this bike: delete the not-yet-consumed parts that
 * belong to the kit. `bike_parts` doesn't snapshot kit membership (kits are
 * just labels on parts), so "remove kit X" = remove this bike's unconsumed
 * parts that are members of kit X. Consumed rows are frozen and kept.
 */
export async function removeBikePartsByKit(
  moId: string,
  bikeId: string,
  kitId: string,
): Promise<BikeKitRemoveResult> {
  if (!moId || !bikeId || !kitId) {
    return { ok: false, error: "Missing MO id, bike id, or kit id." };
  }

  const supabase = await createClient();
  const guard = await assertBikeEditable(supabase, bikeId, moId);
  if (!guard.ok) return guard;

  const { data: memberships, error: memErr } = await supabase
    .from("part_kits")
    .select("part_id")
    .eq("kit_id", kitId);
  if (memErr) {
    return { ok: false, error: `Could not load kit parts: ${memErr.message}` };
  }
  const kitPartIds = (memberships ?? []).map((m) => m.part_id);
  if (kitPartIds.length === 0) {
    return { ok: true, removed: 0, kept: 0 };
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("bike_parts")
    .select("id, inventory_movement_id")
    .eq("bike_id", bikeId)
    .is("removed_at", null)
    .in("part_id", kitPartIds);
  if (rowsErr) {
    return { ok: false, error: `Could not load bike parts: ${rowsErr.message}` };
  }

  const removableIds = (rows ?? [])
    .filter((r) => r.inventory_movement_id == null)
    .map((r) => r.id);
  const kept = (rows ?? []).length - removableIds.length;
  if (removableIds.length === 0) {
    return { ok: true, removed: 0, kept };
  }

  const { error: delErr } = await supabase
    .from("bike_parts")
    .delete()
    .in("id", removableIds);
  if (delErr) {
    return { ok: false, error: `Could not remove kit parts: ${delErr.message}` };
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true, removed: removableIds.length, kept };
}
