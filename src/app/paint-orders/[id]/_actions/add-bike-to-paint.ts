"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type AddBikeToPaintResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Attach a bike to a service order. The bike link drives the at-supplier
 * build gate + traceability; WHAT gets done and the pricing live on the
 * order's item lines (per-bike colour/scope columns are legacy history from
 * the pre-items paint model). Only valid while the order is non-terminal —
 * adding bikes to a `received_back` or `cancelled` order makes no sense.
 *
 * The (service_order_id, bike_id) pair is the primary key on
 * `service_order_bikes`, so re-adds collide gracefully.
 */
export async function addBikeToPaintOrder(
  serviceOrderId: string,
  bikeId: string,
  opts: { notes?: string | null } = {},
): Promise<AddBikeToPaintResult> {
  if (!serviceOrderId) return { ok: false, error: "Missing order id." };
  if (!bikeId) return { ok: false, error: "Pick a bike to add." };

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("service_orders")
    .select("id, status")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (orderErr || !order) {
    return {
      ok: false,
      error: `Could not load order: ${orderErr?.message ?? "not found"}`,
    };
  }
  if (order.status === "received_back" || order.status === "cancelled") {
    return {
      ok: false,
      error: `Cannot add bikes to a ${order.status} order.`,
    };
  }

  const { error: insErr } = await supabase.from("service_order_bikes").insert({
    service_order_id: serviceOrderId,
    bike_id: bikeId,
    notes: nullable(opts.notes ?? null),
  });
  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: false, error: "That bike is already on this order." };
    }
    return { ok: false, error: `Could not add bike: ${insErr.message}` };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  revalidatePath("/paint-orders");
  return { ok: true };
}
