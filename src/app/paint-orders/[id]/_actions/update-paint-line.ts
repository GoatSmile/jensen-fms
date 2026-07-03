"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isPaintScope } from "@/lib/paint/scope";

export type UpdatePaintLineResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Edit a bike's per-line colour and/or scope on a paint order. Allowed only
 * while the order is `planned` — once it's sent, the batch is frozen (same rule
 * as removing a bike). Pass `colorId: null` to clear the per-line colour.
 */
export async function updatePaintLine(
  paintOrderId: string,
  bikeId: string,
  patch: { colorId?: string | null; scope?: string | null },
): Promise<UpdatePaintLineResult> {
  if (!paintOrderId || !bikeId) {
    return { ok: false, error: "Missing paint order or bike id." };
  }

  const scope = patch.scope ?? null;
  if (scope !== null && !isPaintScope(scope)) {
    return { ok: false, error: "Invalid paint scope." };
  }

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("paint_orders")
    .select("id, status")
    .eq("id", paintOrderId)
    .maybeSingle();
  if (orderErr || !order) {
    return {
      ok: false,
      error: `Could not load paint order: ${orderErr?.message ?? "not found"}`,
    };
  }
  if (order.status !== "planned") {
    return {
      ok: false,
      error: "Colour and scope can only be changed while the order is planned.",
    };
  }

  const update: { color_id?: string | null; scope?: string | null } = {};
  if ("colorId" in patch) update.color_id = patch.colorId || null;
  if ("scope" in patch) update.scope = scope;
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase
    .from("paint_order_bikes")
    .update(update)
    .eq("paint_order_id", paintOrderId)
    .eq("bike_id", bikeId);
  if (error) {
    return { ok: false, error: `Could not update line: ${error.message}` };
  }

  revalidatePath(`/paint-orders/${paintOrderId}`);
  return { ok: true };
}
