"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("errors");
  if (!poId) return { ok: false, error: t("missingPoId") };

  const supabase = await createClient();
  const { data: po, error: lookupErr } = await supabase
    .from("purchase_orders")
    .select("id, status, notes")
    .eq("id", poId)
    .maybeSingle();
  if (lookupErr || !po) {
    return {
      ok: false,
      error: t("poCouldNotLoad", {
        detail: lookupErr?.message ?? t("notFound"),
      }),
    };
  }

  const fromStatus = po.status as PurchaseOrderStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: t("alreadyInState") };
  }
  if (!validNextPOStatuses(fromStatus).includes(toStatus)) {
    return {
      ok: false,
      error: t("poCannotMove", { from: fromStatus, to: toStatus }),
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (poTransitionRequiresReason(toStatus) && trimmedReason === "") {
    return {
      ok: false,
      error: t("reasonRequiredCancel"),
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
        error: t("poCouldNotCheckLines", { detail: linesErr.message }),
      };
    }
    if ((count ?? 0) === 0) {
      return {
        ok: false,
        error: t("poAddLineBeforePlacing"),
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
      error: t("poCouldNotUpdateStatus", { detail: updErr.message }),
    };
  }

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${poId}`);
  return { ok: true };
}
