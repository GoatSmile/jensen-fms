"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("errors");
  if (!serviceOrderId) return { ok: false, error: t("missingOrderId") };

  const supabase = await createClient();
  const { data: order, error: lookupErr } = await supabase
    .from("service_orders")
    .select("id, status, sent_at, received_at, notes, supplier_id, service_type_id")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (lookupErr || !order) {
    return {
      ok: false,
      error: t("paintCouldNotLoadOrder", {
        detail: lookupErr?.message ?? t("notFound"),
      }),
    };
  }

  const fromStatus = order.status as ServiceOrderStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: t("alreadyInState") };
  }
  if (!validNextServiceOrderStatuses(fromStatus).includes(toStatus)) {
    return {
      ok: false,
      error: t("paintCannotMove", { from: fromStatus, to: toStatus }),
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (serviceOrderTransitionRequiresReason(toStatus) && trimmedReason === "") {
    return {
      ok: false,
      error: t("reasonRequiredCancel"),
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
      t,
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

  // Guarded on the status we validated against, so a concurrent transition
  // (e.g. a cancel in another tab racing a send) can't be overwritten — the
  // stale write matches zero rows instead.
  const { data: updated, error: updErr } = await supabase
    .from("service_orders")
    .update({
      status: toStatus,
      sent_at: newSentAt,
      received_at: newReceivedAt,
      notes: newNotes,
      updated_at: nowIso,
    })
    .eq("id", serviceOrderId)
    .eq("status", fromStatus)
    .select("id");
  if (updErr) {
    return {
      ok: false,
      error: t("paintCouldNotUpdateStatus", { detail: updErr.message }),
    };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: t("paintStatusChangedConcurrent"),
    };
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
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<TransitionServiceOrderResult> {
  const { data: items, error: itemsErr } = await supabase
    .from("service_order_items")
    .select(
      "id, service_part_type_id, quantity, part_type:service_part_types(name_en)",
    )
    .eq("service_order_id", orderId);
  if (itemsErr) {
    return {
      ok: false,
      error: t("paintCouldNotLoadItems", { detail: itemsErr.message }),
    };
  }
  if (!items || items.length === 0) {
    return {
      ok: false,
      error: t("paintAddItemBeforeSending"),
    };
  }

  const list = await loadCurrentPriceList(supabase, supplierId, serviceTypeId);
  if (!list) {
    return {
      ok: false,
      error: t("paintNoPriceList"),
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
      error: t("paintPriceListMissingPrices", { name: list.name, names }),
    };
  }

  // FX freezes with the price (fx_rate_to_dkk = 1 for DKK lists).
  let fxRate = 1;
  if (list.currency !== "DKK") {
    const fx = await getOrFetchRate(supabase, list.currency, "DKK", sendDate);
    if (!fx) {
      return {
        ok: false,
        error: t("paintCouldNotLookUpRate", {
          currency: list.currency,
          date: sendDate,
        }),
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
        error: t("paintCouldNotFreezeSnapshot", { detail: error.message }),
      };
    }
  }

  return { ok: true };
}
