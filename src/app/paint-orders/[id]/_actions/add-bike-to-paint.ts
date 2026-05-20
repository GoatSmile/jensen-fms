"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type AddBikeToPaintResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Attach a bike to a paint order. Only valid while the paint order is still
 * non-terminal — adding bikes to a `received_back` or `cancelled` order makes
 * no sense.
 *
 * The (paint_order_id, bike_id) pair is the primary key on
 * `paint_order_bikes`, so re-adds collide gracefully.
 */
export async function addBikeToPaintOrder(
  paintOrderId: string,
  bikeId: string,
  notes: string | null,
): Promise<AddBikeToPaintResult> {
  if (!paintOrderId) return { ok: false, error: "Missing paint order id." };
  if (!bikeId) return { ok: false, error: "Pick a bike to add." };

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
  if (order.status === "received_back" || order.status === "cancelled") {
    return {
      ok: false,
      error: `Cannot add bikes to a ${order.status} paint order.`,
    };
  }

  const trimmedNotes = nullable(notes);

  const { error: insErr } = await supabase
    .from("paint_order_bikes")
    .insert({
      paint_order_id: paintOrderId,
      bike_id: bikeId,
      notes: trimmedNotes,
    });
  if (insErr) {
    if (insErr.code === "23505") {
      return {
        ok: false,
        error: "That bike is already on this paint order.",
      };
    }
    return {
      ok: false,
      error: `Could not add bike: ${insErr.message}`,
    };
  }

  revalidatePath(`/paint-orders/${paintOrderId}`);
  revalidatePath("/paint-orders");
  return { ok: true };
}
