"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ManageItemResult = { ok: true } | { ok: false; error: string };

/**
 * Item lines (part type × qty × colour) are editable only while the order is
 * `planned` — the send transition freezes each line's price snapshot, so a
 * sent order's lines are its cost basis and must not move. Same edit-window
 * rule as PO lines in draft.
 */
async function assertPlanned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceOrderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: order, error } = await supabase
    .from("service_orders")
    .select("id, status")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (error || !order) {
    return {
      ok: false,
      error: `Could not load order: ${error?.message ?? "not found"}`,
    };
  }
  if (order.status !== "planned") {
    return {
      ok: false,
      error: `Items can only be changed while the order is planned (current: ${order.status}).`,
    };
  }
  return { ok: true };
}

function parseQuantity(
  raw: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: "Quantity must be a whole number above zero." };
  }
  return { ok: true, value: n };
}

export async function addServiceOrderItem(
  serviceOrderId: string,
  input: {
    servicePartTypeId: string;
    quantity: number;
    colorId?: string | null;
    notes?: string | null;
  },
): Promise<ManageItemResult> {
  if (!serviceOrderId) return { ok: false, error: "Missing order id." };
  if (!input.servicePartTypeId) {
    return { ok: false, error: "Pick a part type." };
  }
  const qty = parseQuantity(input.quantity);
  if (!qty.ok) return qty;

  const supabase = await createClient();
  const guard = await assertPlanned(supabase, serviceOrderId);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("service_order_items").insert({
    service_order_id: serviceOrderId,
    service_part_type_id: input.servicePartTypeId,
    quantity: qty.value,
    color_id: nullable(input.colorId ?? null),
    notes: nullable(input.notes ?? null),
  });
  if (error) {
    return { ok: false, error: `Could not add item: ${error.message}` };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  return { ok: true };
}

export async function updateServiceOrderItem(
  serviceOrderId: string,
  itemId: string,
  patch: { quantity?: number; colorId?: string | null },
): Promise<ManageItemResult> {
  if (!serviceOrderId || !itemId) {
    return { ok: false, error: "Missing order or item id." };
  }

  const update: { quantity?: number; color_id?: string | null } = {};
  if ("quantity" in patch && patch.quantity !== undefined) {
    const qty = parseQuantity(patch.quantity);
    if (!qty.ok) return qty;
    update.quantity = qty.value;
  }
  if ("colorId" in patch) update.color_id = patch.colorId || null;
  if (Object.keys(update).length === 0) return { ok: true };

  const supabase = await createClient();
  const guard = await assertPlanned(supabase, serviceOrderId);
  if (!guard.ok) return guard;

  const { error } = await supabase
    .from("service_order_items")
    .update(update)
    .eq("id", itemId)
    .eq("service_order_id", serviceOrderId);
  if (error) {
    return { ok: false, error: `Could not update item: ${error.message}` };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  return { ok: true };
}

export async function removeServiceOrderItem(
  serviceOrderId: string,
  itemId: string,
): Promise<ManageItemResult> {
  if (!serviceOrderId || !itemId) {
    return { ok: false, error: "Missing order or item id." };
  }

  const supabase = await createClient();
  const guard = await assertPlanned(supabase, serviceOrderId);
  if (!guard.ok) return guard;

  const { error } = await supabase
    .from("service_order_items")
    .delete()
    .eq("id", itemId)
    .eq("service_order_id", serviceOrderId);
  if (error) {
    return { ok: false, error: `Could not remove item: ${error.message}` };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  return { ok: true };
}
