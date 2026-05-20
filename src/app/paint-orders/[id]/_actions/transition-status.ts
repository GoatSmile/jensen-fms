"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  paintOrderTransitionRequiresReason,
  validNextPaintOrderStatuses,
  type PaintOrderStatus,
} from "@/lib/paint/status";

export type TransitionPaintOrderResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Move a paint order from its current status to `toStatus`. Validates the
 * transition matrix. Stamps `sent_at` the first time the order enters
 * `sent_to_painter`, and `received_at` the first time it enters
 * `received_back`. Cancellation requires a reason which is appended to notes
 * (no dedicated state log for paint orders).
 */
export async function transitionPaintOrderStatus(
  paintOrderId: string,
  toStatus: PaintOrderStatus,
  reason: string | null,
): Promise<TransitionPaintOrderResult> {
  if (!paintOrderId) return { ok: false, error: "Missing paint order id." };

  const supabase = await createClient();
  const { data: order, error: lookupErr } = await supabase
    .from("paint_orders")
    .select("id, status, sent_at, received_at, notes")
    .eq("id", paintOrderId)
    .maybeSingle();
  if (lookupErr || !order) {
    return {
      ok: false,
      error: `Could not load paint order: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const fromStatus = order.status as PaintOrderStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: "Already in that state." };
  }
  if (!validNextPaintOrderStatuses(fromStatus).includes(toStatus)) {
    return {
      ok: false,
      error: `Cannot move from "${fromStatus}" to "${toStatus}".`,
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (paintOrderTransitionRequiresReason(toStatus) && trimmedReason === "") {
    return {
      ok: false,
      error: "A reason is required when cancelling a paint order.",
    };
  }

  const nowIso = new Date().toISOString();
  const newSentAt =
    toStatus === "sent_to_painter" && !order.sent_at ? nowIso : order.sent_at;
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
    .from("paint_orders")
    .update({
      status: toStatus,
      sent_at: newSentAt,
      received_at: newReceivedAt,
      notes: newNotes,
      updated_at: nowIso,
    })
    .eq("id", paintOrderId);
  if (updErr) {
    return { ok: false, error: `Could not update status: ${updErr.message}` };
  }

  revalidatePath("/paint-orders");
  revalidatePath(`/paint-orders/${paintOrderId}`);
  return { ok: true };
}
