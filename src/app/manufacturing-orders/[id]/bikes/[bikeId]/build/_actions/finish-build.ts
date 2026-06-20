"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { autoAdvanceMOAfterBuild } from "../../../../_actions/transition-mo";

export type FinishBuildResult =
  | { ok: true; buildCostDkk: number; partsConsumed: number }
  | { ok: false; error: string };

/**
 * Finish-build for a specific bike using the workbench's per-bike parts list.
 *
 * Reads `bike_parts` rows that don't yet have an `inventory_movement_id`,
 * consumes from inventory for each, links the movement, and stamps the
 * bike's build_cost_dkk. Final UPDATE flips status to `in_stock` — the
 * state-log + MO-completion-quantity triggers fire on that UPDATE.
 *
 * Idempotent retry: re-running the action skips already-consumed rows.
 *
 * Pre-conditions:
 *   - Bike must belong to this MO.
 *   - Bike status must be planning or building.
 *   - Bike must have a frame_number (it gets one at creation, but in case
 *     someone nulled it manually we double-check).
 *   - There must be at least one `bike_parts` row — finishing a build with
 *     zero parts is almost certainly a mistake.
 */
export async function finishBikeBuild(
  moId: string,
  bikeId: string,
): Promise<FinishBuildResult> {
  if (!moId || !bikeId) {
    return { ok: false, error: "Missing MO id or bike id." };
  }

  const supabase = await createClient();

  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, status, manufacturing_order_id, frame_number")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr || !bike) {
    return {
      ok: false,
      error: `Could not load bike: ${bikeErr?.message ?? "not found"}`,
    };
  }
  if (bike.manufacturing_order_id !== moId) {
    return { ok: false, error: "That bike doesn't belong to this MO." };
  }
  if (
    bike.status === "in_stock" ||
    bike.status === "assigned" ||
    bike.status === "in_service"
  ) {
    return { ok: false, error: "Bike is already marked built." };
  }
  if (bike.status === "retired" || bike.status === "lost_or_stolen") {
    return {
      ok: false,
      error: "Cannot finish-build a retired or lost/stolen bike.",
    };
  }
  if (!bike.frame_number || bike.frame_number.trim() === "") {
    return { ok: false, error: "Frame number is required before finishing." };
  }

  // Pick the default inventory location for v1 (single-location consume).
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
      error: `No active inventory location to consume from: ${
        locErr?.message ?? "none configured"
      }`,
    };
  }

  // Pull the bike's parts list. Anything with an inventory_movement_id is
  // already consumed from a prior partial run.
  const { data: bikeParts, error: bpErr } = await supabase
    .from("bike_parts")
    .select("id, part_id, quantity, inventory_movement_id")
    .eq("bike_id", bikeId)
    .is("removed_at", null);
  if (bpErr) {
    return { ok: false, error: `Could not load bike parts: ${bpErr.message}` };
  }
  if (!bikeParts || bikeParts.length === 0) {
    return {
      ok: false,
      error:
        "No parts on this bike. Pick parts in the workbench (or copy the MO recipe) before finishing the build.",
    };
  }

  const toConsume = bikeParts.filter((bp) => bp.inventory_movement_id == null);

  // Last-cost lookup for inventory_movements.unit_cost_dkk + build_cost_dkk.
  const partIds = [...new Set(bikeParts.map((bp) => bp.part_id))];
  const lastCostByPart = new Map<string, number>();
  if (partIds.length > 0) {
    const { data: costs } = await supabase
      .from("v_part_last_cost")
      .select("part_id, last_cost_dkk")
      .in("part_id", partIds);
    for (const c of costs ?? []) {
      if (c.part_id != null && c.last_cost_dkk != null) {
        lastCostByPart.set(c.part_id, Number(c.last_cost_dkk));
      }
    }
  }

  let runningBuildCostDkk = 0;
  let partsConsumed = 0;

  // First add up rows that were already consumed on a prior partial run so
  // the build_cost stays correct after retry.
  for (const bp of bikeParts) {
    if (bp.inventory_movement_id == null) continue;
    const { data: mov } = await supabase
      .from("inventory_movements")
      .select("unit_cost_dkk")
      .eq("id", bp.inventory_movement_id)
      .maybeSingle();
    if (mov?.unit_cost_dkk != null) {
      runningBuildCostDkk += Number(mov.unit_cost_dkk) * Number(bp.quantity);
    }
  }

  for (const bp of toConsume) {
    const qty = Number(bp.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const lastCostDkk = lastCostByPart.get(bp.part_id) ?? null;

    const { data: movement, error: movErr } = await supabase
      .from("inventory_movements")
      .insert({
        part_id: bp.part_id,
        location_id: location.id,
        movement_type: "consumed_build",
        quantity_delta: -qty,
        unit_cost_dkk: lastCostDkk,
        source_entity_type: "bike_part",
        source_entity_id: bp.id,
        reason: `Build of bike ${bikeId}`,
      })
      .select("id")
      .single();
    if (movErr || !movement) {
      return {
        ok: false,
        error: `Could not write inventory movement for part ${bp.part_id}: ${
          movErr?.message ?? "unknown error"
        }. Re-run to retry; already-consumed rows will be skipped.`,
      };
    }

    const { error: linkErr } = await supabase
      .from("bike_parts")
      .update({ inventory_movement_id: movement.id })
      .eq("id", bp.id);
    if (linkErr) {
      return {
        ok: false,
        error: `Could not link movement to bike_part ${bp.id}: ${linkErr.message}. Re-run to retry.`,
      };
    }

    if (lastCostDkk != null) {
      runningBuildCostDkk += lastCostDkk * qty;
    }
    partsConsumed += 1;
  }

  // Advance bike status AND stamp build_cost_dkk + built_at. The idempotent
  // guard above returns early if the bike is already in_stock, so this UPDATE
  // runs once on the planning/building → in_stock transition.
  const nowIso = new Date().toISOString();
  const { error: statusErr } = await supabase
    .from("bikes")
    .update({
      status: "in_stock",
      build_cost_dkk: runningBuildCostDkk > 0 ? runningBuildCostDkk : null,
      built_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", bikeId);
  if (statusErr) {
    return {
      ok: false,
      error: `Could not advance status: ${statusErr.message}`,
    };
  }

  // The MO-completion trigger has incremented completed_quantity. Auto-
  // advance the MO status (planned → in_progress on first build,
  // in_progress → completed at target).
  await autoAdvanceMOAfterBuild(moId);

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath("/manufacturing-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath("/parts");

  return {
    ok: true,
    buildCostDkk: runningBuildCostDkk,
    partsConsumed,
  };
}
