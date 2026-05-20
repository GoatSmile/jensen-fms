"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  poTransitionRequiresReason,
  validNextPOStatuses,
  type PurchaseOrderStatus,
} from "@/lib/po/status";

export type POTransitionResult = { ok: true } | { ok: false; error: string };

/**
 * Move a PO from its current status to `toStatus`. Validates the transition
 * matrix; cancellation requires a reason which gets prepended to the PO's
 * notes for the audit trail (mirrors the MO cancel pattern — no dedicated
 * po_state_log exists yet).
 *
 * Note: the `placed → partially_received → received` advancement is handled
 * by the receive flow, not this dropdown. This action is the only path that
 * stamps `cancelled` and the only manual path from `draft → placed`.
 */
export async function transitionPO(
  poId: string,
  toStatus: PurchaseOrderStatus,
  reason: string | null,
): Promise<POTransitionResult> {
  if (!poId) return { ok: false, error: "Missing PO id." };

  const supabase = await createClient();
  const { data: po, error: lookupErr } = await supabase
    .from("purchase_orders")
    .select("id, status, notes")
    .eq("id", poId)
    .maybeSingle();
  if (lookupErr || !po) {
    return {
      ok: false,
      error: `Could not load PO: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const fromStatus = po.status as PurchaseOrderStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: "Already in that state." };
  }
  if (!validNextPOStatuses(fromStatus).includes(toStatus)) {
    return {
      ok: false,
      error: `Cannot move from "${fromStatus}" to "${toStatus}".`,
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (poTransitionRequiresReason(toStatus) && trimmedReason === "") {
    return {
      ok: false,
      error: "A reason is required when cancelling a PO.",
    };
  }

  // Guard against moving an empty draft straight to placed — without lines
  // there's nothing to receive against, which would create a stale "placed"
  // PO that can never advance.
  if (toStatus === "placed") {
    const { count, error: linesErr } = await supabase
      .from("purchase_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", poId);
    if (linesErr) {
      return {
        ok: false,
        error: `Could not check lines: ${linesErr.message}`,
      };
    }
    if ((count ?? 0) === 0) {
      return {
        ok: false,
        error: "Add at least one line before placing this PO.",
      };
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const newNotes =
    toStatus === "cancelled" && trimmedReason !== ""
      ? `[Cancelled ${today}: ${trimmedReason}]\n${po.notes ?? ""}`.trim()
      : po.notes;

  const { error: updErr } = await supabase
    .from("purchase_orders")
    .update({
      status: toStatus,
      notes: newNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poId);
  if (updErr) {
    return {
      ok: false,
      error: `Could not update status: ${updErr.message}`,
    };
  }

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${poId}`);
  return { ok: true };
}
