"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  CLOSED_WO_STATUSES,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

export type WOPartsResult = { ok: true } | { ok: false; error: string };

/**
 * Add a part to a work order. Mirrors `mark-bike-built.ts`:
 *
 *   1. Look up default inventory location (first active).
 *   2. Look up last cost via v_part_last_cost (fallback unit_price).
 *   3. Insert inventory_movements (consumed_maintenance, negative qty).
 *   4. Insert work_order_parts pointing at that movement.
 *   5. Patch the movement's source_entity_id with the new wo_parts.id so the
 *      ledger traces back both ways.
 *
 * Refuses when the WO is completed or cancelled. Defensively traps the
 * (work_order_id, part_id) collision (23505) in case the DB has the unique
 * constraint configured.
 */
export async function addPartToWO(
  woId: string,
  formData: FormData,
): Promise<WOPartsResult> {
  if (!woId) return { ok: false, error: "Missing work order id." };

  const partId = nullable(formData.get("part_id"));
  const qtyRaw = nullable(formData.get("quantity"));
  const unitPriceRaw = nullable(formData.get("unit_price"));

  if (!partId) return { ok: false, error: "Pick a part." };
  const qty = Number(qtyRaw);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be a positive number." };
  }

  const supabase = await createClient();
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, status, bike_id")
    .eq("id", woId)
    .maybeSingle();
  if (woErr || !wo) {
    return {
      ok: false,
      error: `Could not load work order: ${woErr?.message ?? "not found"}`,
    };
  }
  if (CLOSED_WO_STATUSES.includes(wo.status as WorkOrderStatus)) {
    return {
      ok: false,
      error: "Work order is closed — parts can't be added.",
    };
  }

  // Default inventory location — first active by code (mirrors mark-bike-built).
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

  // Last-cost fallback for unit_price.
  let unitPrice: number | null = null;
  if (unitPriceRaw != null) {
    const n = Number(unitPriceRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Unit price must be a non-negative number." };
    }
    unitPrice = n;
  } else {
    const { data: cost } = await supabase
      .from("v_part_last_cost")
      .select("last_cost_dkk")
      .eq("part_id", partId)
      .maybeSingle();
    if (cost?.last_cost_dkk != null) {
      unitPrice = Number(cost.last_cost_dkk);
    }
  }

  // Insert the movement first; source_entity_id gets patched after the
  // wo_parts row exists.
  const { data: movement, error: movErr } = await supabase
    .from("inventory_movements")
    .insert({
      part_id: partId,
      location_id: location.id,
      movement_type: "consumed_maintenance",
      quantity_delta: -qty,
      unit_cost_dkk: unitPrice,
      source_entity_type: "work_order_part",
      source_entity_id: null,
      reason: `Work order ${woId}`,
    })
    .select("id")
    .single();
  if (movErr || !movement) {
    return {
      ok: false,
      error: `Could not write inventory movement: ${movErr?.message ?? "unknown error"}`,
    };
  }

  const { data: woPart, error: wopErr } = await supabase
    .from("work_order_parts")
    .insert({
      work_order_id: woId,
      part_id: partId,
      quantity: qty,
      unit_price: unitPrice,
      inventory_movement_id: movement.id,
    })
    .select("id")
    .single();
  if (wopErr || !woPart) {
    // Compensating delete: tear down the movement we just wrote so a failed
    // add doesn't leave a phantom consumption on the ledger.
    await supabase.from("inventory_movements").delete().eq("id", movement.id);
    if (wopErr?.code === "23505") {
      return {
        ok: false,
        error: "That part is already on this work order. Remove the existing row first.",
      };
    }
    return {
      ok: false,
      error: `Could not record part on work order: ${wopErr?.message ?? "unknown error"}`,
    };
  }

  // Backlink the movement to the wo_parts row.
  await supabase
    .from("inventory_movements")
    .update({ source_entity_id: woPart.id })
    .eq("id", movement.id);

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${woId}`);
  revalidatePath("/parts");
  return { ok: true };
}

/**
 * Remove a part from a work order, reversing the inventory consumption.
 * Deletes the work_order_parts row first, then the linked inventory_movement.
 * Refuses when the WO is completed or cancelled.
 */
export async function removePartFromWO(
  woId: string,
  woPartId: string,
): Promise<WOPartsResult> {
  if (!woId || !woPartId) {
    return { ok: false, error: "Missing work order id or row id." };
  }

  const supabase = await createClient();
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, status")
    .eq("id", woId)
    .maybeSingle();
  if (woErr || !wo) {
    return {
      ok: false,
      error: `Could not load work order: ${woErr?.message ?? "not found"}`,
    };
  }
  if (CLOSED_WO_STATUSES.includes(wo.status as WorkOrderStatus)) {
    return {
      ok: false,
      error: "Work order is closed — parts can't be removed.",
    };
  }

  const { data: row, error: rowErr } = await supabase
    .from("work_order_parts")
    .select("id, work_order_id, inventory_movement_id")
    .eq("id", woPartId)
    .maybeSingle();
  if (rowErr || !row) {
    return {
      ok: false,
      error: `Could not load row: ${rowErr?.message ?? "not found"}`,
    };
  }
  if (row.work_order_id !== woId) {
    return { ok: false, error: "That row does not belong to this work order." };
  }

  const { error: delErr } = await supabase
    .from("work_order_parts")
    .delete()
    .eq("id", woPartId);
  if (delErr) {
    return { ok: false, error: `Could not remove row: ${delErr.message}` };
  }

  if (row.inventory_movement_id) {
    const { error: movDelErr } = await supabase
      .from("inventory_movements")
      .delete()
      .eq("id", row.inventory_movement_id);
    if (movDelErr) {
      // The wo_parts row is gone but the movement persists. The user can
      // adjust stock manually; we surface the error so they know.
      return {
        ok: false,
        error: `Part removed but inventory movement could not be reversed: ${movDelErr.message}`,
      };
    }
  }

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${woId}`);
  revalidatePath("/parts");
  return { ok: true };
}
