"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RemoveBikeFromPaintResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Remove a bike from a paint order. Only allowed while the order is still in
 * `planned` — once the batch is sent we treat the membership as historical
 * record. If the bike was added in error after sending, fix it by editing the
 * row directly in Supabase.
 */
export async function removeBikeFromPaintOrder(
  paintOrderId: string,
  bikeId: string,
): Promise<RemoveBikeFromPaintResult> {
  if (!paintOrderId) return { ok: false, error: "Missing paint order id." };
  if (!bikeId) return { ok: false, error: "Missing bike id." };

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("paint_orders")
    .select("status")
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
      error: `Bikes can only be removed while the paint order is still planned (current: ${order.status}).`,
    };
  }

  const { error: delErr } = await supabase
    .from("paint_order_bikes")
    .delete()
    .eq("paint_order_id", paintOrderId)
    .eq("bike_id", bikeId);
  if (delErr) {
    return {
      ok: false,
      error: `Could not remove bike: ${delErr.message}`,
    };
  }

  revalidatePath(`/paint-orders/${paintOrderId}`);
  revalidatePath("/paint-orders");
  return { ok: true };
}
