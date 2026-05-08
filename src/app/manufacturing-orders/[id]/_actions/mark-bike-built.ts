"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type MarkBuiltResult = { ok: true } | { ok: false; error: string };

/**
 * Mark a bike as built: consume parts from inventory, record bike_parts rows,
 * advance bike status to 'in_stock'. The bike-status trigger logs the state
 * change AND increments the MO's completed_quantity automatically.
 *
 * Sequencing:
 *   1. Read MO parts list + per-part landed cost (for inventory valuation)
 *   2. Look up the default inventory location (single-location for v1; will
 *      be configurable when multi-location lands)
 *   3. For each MO part:
 *        a. Insert inventory_movements (consumed_build, negative qty)
 *        b. Insert bike_parts row pointing at the movement
 *   4. Update bike.status to 'in_stock' (triggers fire)
 *
 * Not transactional. If we fail mid-loop the bike stays in 'building' and the
 * action can be re-run; we skip parts already in bike_parts to make it
 * idempotent enough.
 */
export async function markBikeBuilt(
  moId: string,
  bikeId: string,
): Promise<MarkBuiltResult> {
  if (!moId || !bikeId) {
    return { ok: false, error: "Missing MO id or bike id." };
  }

  const supabase = await createClient();

  // Validate bike state.
  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, status, manufacturing_order_id")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr || !bike) {
    return { ok: false, error: `Could not load bike: ${bikeErr?.message ?? "not found"}` };
  }
  if (bike.manufacturing_order_id !== moId) {
    return { ok: false, error: "That bike does not belong to this MO." };
  }
  if (bike.status === "in_stock" || bike.status === "assigned" || bike.status === "in_service") {
    return { ok: false, error: "Bike is already marked built." };
  }
  if (bike.status === "retired" || bike.status === "lost_or_stolen") {
    return { ok: false, error: "Cannot mark a retired or lost/stolen bike as built." };
  }

  // Pull MO parts; landed-cost lookup is a separate query because the
  // generated types don't model v_part_last_cost as a typed embed.
  const { data: moParts, error: mopErr } = await supabase
    .from("manufacturing_order_parts")
    .select("id, part_id, quantity_per_bike")
    .eq("manufacturing_order_id", moId);
  if (mopErr) {
    return { ok: false, error: `Could not load MO parts: ${mopErr.message}` };
  }

  const partIds = (moParts ?? []).map((p) => p.part_id);
  const lastCostByPart = new Map<string, number>();
  if (partIds.length > 0) {
    const { data: costs } = await supabase
      .from("v_part_last_cost")
      .select("part_id, last_cost_dkk")
      .in("part_id", partIds);
    for (const row of costs ?? []) {
      if (row.part_id != null && row.last_cost_dkk != null) {
        lastCostByPart.set(row.part_id, Number(row.last_cost_dkk));
      }
    }
  }

  // Default inventory location — first active. Multi-location support is
  // already in adjust-stock-dialog and the receive flow; build pulls from a
  // single location for v1.
  const { data: location, error: locErr } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (locErr || !location) {
    return {
      ok: false,
      error: `No active inventory location to consume from: ${locErr?.message ?? "none configured"}`,
    };
  }

  // Skip parts already on this bike (idempotent retry).
  const { data: existingBikeParts } = await supabase
    .from("bike_parts")
    .select("part_id")
    .eq("bike_id", bikeId);
  const alreadyInstalled = new Set(
    (existingBikeParts ?? []).map((r) => r.part_id),
  );

  for (const mop of moParts ?? []) {
    if (alreadyInstalled.has(mop.part_id)) continue;
    const qty = Number(mop.quantity_per_bike);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const lastCostDkk = lastCostByPart.get(mop.part_id) ?? null;

    const { data: movement, error: movErr } = await supabase
      .from("inventory_movements")
      .insert({
        part_id: mop.part_id,
        location_id: location.id,
        movement_type: "consumed_build",
        quantity_delta: -qty,
        unit_cost_dkk: lastCostDkk,
        source_entity_type: "manufacturing_order_part",
        source_entity_id: mop.id,
        reason: `Build of bike ${bikeId}`,
      })
      .select("id")
      .single();
    if (movErr || !movement) {
      return {
        ok: false,
        error: `Could not write inventory movement for part ${mop.part_id}: ${movErr?.message ?? "unknown error"}. Re-run to retry; already-consumed parts will be skipped.`,
      };
    }

    const { error: bpErr } = await supabase.from("bike_parts").insert({
      bike_id: bikeId,
      part_id: mop.part_id,
      quantity: qty,
      inventory_movement_id: movement.id,
    });
    if (bpErr) {
      return {
        ok: false,
        error: `Could not link part ${mop.part_id} to bike: ${bpErr.message}. Re-run to retry.`,
      };
    }
  }

  // Advance bike status. The state-log + MO-completion triggers fire here.
  const { error: statusErr } = await supabase
    .from("bikes")
    .update({
      status: "in_stock",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bikeId);
  if (statusErr) {
    return { ok: false, error: `Could not advance status: ${statusErr.message}` };
  }

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath("/manufacturing-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  revalidatePath("/parts");
  return { ok: true };
}
