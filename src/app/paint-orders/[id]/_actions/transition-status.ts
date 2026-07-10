"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getOrFetchRate } from "@/lib/fx/get-or-fetch";
import {
  serviceOrderTransitionRequiresReason,
  validNextServiceOrderStatuses,
  type ServiceOrderStatus,
} from "@/lib/services/status";
import { loadCurrentPriceList, priceOrderItems } from "@/lib/services/pricing";

export type TransitionServiceOrderResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Move a service order to `toStatus`. Validates the transition matrix,
 * stamps `sent_at` the first time the order enters `sent` and `received_at`
 * the first time it enters `received_back`. Cancellation requires a reason,
 * appended to notes (no dedicated state log for service orders).
 *
 * SEND FREEZES THE COST BASIS (the purchase_order_lines pattern): every item
 * line gets supplier_item_no + unit_price + currency + fx_rate_to_dkk
 * snapshotted from the supplier's CURRENT price list at this moment. A later
 * list revision never rewrites a sent order. Send is blocked while the order
 * has no items or an item can't be priced — an unpriced batch is exactly the
 * old under-quoting trap (the 310→710 kr lesson) this model exists to close.
 */
export async function transitionServiceOrderStatus(
  serviceOrderId: string,
  toStatus: ServiceOrderStatus,
  reason: string | null,
): Promise<TransitionServiceOrderResult> {
  if (!serviceOrderId) return { ok: false, error: "Missing order id." };

  const supabase = await createClient();
  const { data: order, error: lookupErr } = await supabase
    .from("service_orders")
    .select("id, status, sent_at, received_at, notes, supplier_id, service_type_id")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (lookupErr || !order) {
    return {
      ok: false,
      error: `Could not load order: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const fromStatus = order.status as ServiceOrderStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: "Already in that state." };
  }
  if (!validNextServiceOrderStatuses(fromStatus).includes(toStatus)) {
    return {
      ok: false,
      error: `Cannot move from "${fromStatus}" to "${toStatus}".`,
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (serviceOrderTransitionRequiresReason(toStatus) && trimmedReason === "") {
    return {
      ok: false,
      error: "A reason is required when cancelling the order.",
    };
  }

  const nowIso = new Date().toISOString();

  if (toStatus === "sent") {
    const snapshot = await snapshotItemPrices(
      supabase,
      order.id,
      order.supplier_id,
      order.service_type_id,
      nowIso.slice(0, 10),
    );
    if (!snapshot.ok) return snapshot;
  }

  const newSentAt =
    toStatus === "sent" && !order.sent_at ? nowIso : order.sent_at;
  const newReceivedAt =
    toStatus === "received_back" && !order.received_at
      ? nowIso
      : order.received_at;

  const today = nowIso.slice(0, 10);
  const newNotes =
    toStatus === "cancelled" && trimmedReason !== ""
      ? `[Cancelled ${today}: ${trimmedReason}]\n${order.notes ?? ""}`.trim()
      : order.notes;

  const { error: updErr } = await supabase
    .from("service_orders")
    .update({
      status: toStatus,
      sent_at: newSentAt,
      received_at: newReceivedAt,
      notes: newNotes,
      updated_at: nowIso,
    })
    .eq("id", serviceOrderId);
  if (updErr) {
    return { ok: false, error: `Could not update status: ${updErr.message}` };
  }

  revalidatePath("/paint-orders");
  revalidatePath(`/paint-orders/${serviceOrderId}`);
  return { ok: true };
}

/**
 * Resolve every item against the supplier's current list and write the
 * frozen snapshot. All-or-nothing: any unpriceable line blocks the send
 * with a message naming what's missing.
 */
async function snapshotItemPrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  supplierId: string,
  serviceTypeId: string,
  sendDate: string,
): Promise<TransitionServiceOrderResult> {
  const { data: items, error: itemsErr } = await supabase
    .from("service_order_items")
    .select(
      "id, service_part_type_id, quantity, part_type:service_part_types(name_en)",
    )
    .eq("service_order_id", orderId);
  if (itemsErr) {
    return { ok: false, error: `Could not load items: ${itemsErr.message}` };
  }
  if (!items || items.length === 0) {
    return {
      ok: false,
      error:
        "Add at least one item line (what gets painted, and how many) before sending — the send freezes the order's cost basis.",
    };
  }

  const list = await loadCurrentPriceList(supabase, supplierId, serviceTypeId);
  if (!list) {
    return {
      ok: false,
      error:
        "This supplier has no current price list for this service, so the items can't be priced. Add the price list first.",
    };
  }

  const priced = priceOrderItems(list, items);
  const unpriced = items.filter((i) => priced.byItemId.get(i.id) == null);
  if (unpriced.length > 0) {
    const names = [
      ...new Set(unpriced.map((i) => i.part_type?.name_en ?? "unknown")),
    ].join(", ");
    return {
      ok: false,
      error: `The current price list ("${list.name}") has no price for: ${names}. Add the missing prices or remove those lines before sending.`,
    };
  }

  // FX freezes with the price (fx_rate_to_dkk = 1 for DKK lists).
  let fxRate = 1;
  if (list.currency !== "DKK") {
    const fx = await getOrFetchRate(supabase, list.currency, "DKK", sendDate);
    if (!fx) {
      return {
        ok: false,
        error: `Could not look up the ${list.currency}→DKK rate for ${sendDate}. Try again, or check the FX admin.`,
      };
    }
    fxRate = fx.rate;
  }

  for (const item of items) {
    const resolved = priced.byItemId.get(item.id);
    if (!resolved) continue; // unreachable — blocked above
    const { error } = await supabase
      .from("service_order_items")
      .update({
        supplier_item_no: resolved.item.supplier_item_no,
        unit_price: resolved.item.unit_price,
        currency: list.currency,
        fx_rate_to_dkk: fxRate,
      })
      .eq("id", item.id);
    if (error) {
      return {
        ok: false,
        error: `Could not freeze the price snapshot: ${error.message}. The order was NOT sent — fix and retry.`,
      };
    }
  }

  return { ok: true };
}
