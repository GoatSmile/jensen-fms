"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { isPaintScope } from "@/lib/paint/scope";

export type AddBikeToPaintResult =
  | { ok: true }
  | { ok: false; error: string };

export type AddBikeToPaintOptions = {
  /** Per-line colour; null falls back to the order's batch-default colour. */
  colorId?: string | null;
  /** Per-line scope (std | svaj); null = unspecified. */
  scope?: string | null;
  notes?: string | null;
};

/**
 * Attach a bike to a paint order with its own colour + scope. Only valid while
 * the paint order is still non-terminal — adding bikes to a `received_back` or
 * `cancelled` order makes no sense.
 *
 * The (paint_order_id, bike_id) pair is the primary key on
 * `paint_order_bikes`, so re-adds collide gracefully. If no per-line colour is
 * given we inherit the order's header (batch-default) colour.
 */
export async function addBikeToPaintOrder(
  paintOrderId: string,
  bikeId: string,
  opts: AddBikeToPaintOptions = {},
): Promise<AddBikeToPaintResult> {
  if (!paintOrderId) return { ok: false, error: "Missing paint order id." };
  if (!bikeId) return { ok: false, error: "Pick a bike to add." };

  const scope = opts.scope ?? null;
  if (scope !== null && !isPaintScope(scope)) {
    return { ok: false, error: "Invalid paint scope." };
  }

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("paint_orders")
    .select("id, status, color_id")
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

  const trimmedNotes = nullable(opts.notes ?? null);
  // Inherit the order's batch-default colour when no per-line colour is chosen.
  const color_id = nullable(opts.colorId ?? null) ?? order.color_id ?? null;

  const { error: insErr } = await supabase
    .from("paint_order_bikes")
    .insert({
      paint_order_id: paintOrderId,
      bike_id: bikeId,
      color_id,
      scope,
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
