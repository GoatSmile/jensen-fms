"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  OPEN_TICKET_STATUSES,
  type TicketStatus,
} from "@/lib/maintenance/ticket-status";
import {
  validNextWOStatuses,
  woTransitionRequiresReason,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

export type WOTransitionResult = { ok: true } | { ok: false; error: string };

/**
 * Cancelling a WO returns any consumed parts to stock (owner decision
 * 2026-07-23: the work didn't happen). Reverses the same way removePartFromWO
 * does — delete the work_order_parts rows + their linked negative
 * inventory_movements, so the SUM-based on-hand goes back up. Best-effort per
 * table; a failure aborts before the status flip so the caller can retry.
 */
async function returnWOPartsToStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  woId: string,
): Promise<WOTransitionResult> {
  const t = await getTranslations("errors");
  const { data: rows, error } = await supabase
    .from("work_order_parts")
    .select("id, inventory_movement_id")
    .eq("work_order_id", woId);
  if (error) {
    return { ok: false, error: t("woCouldNotLoadRow", { detail: error.message }) };
  }
  if (!rows || rows.length === 0) return { ok: true };

  const { error: delErr } = await supabase
    .from("work_order_parts")
    .delete()
    .eq("work_order_id", woId);
  if (delErr) {
    return { ok: false, error: t("woCouldNotRemoveRow", { detail: delErr.message }) };
  }

  const movementIds = rows
    .map((r) => r.inventory_movement_id)
    .filter((x): x is string => !!x);
  if (movementIds.length > 0) {
    const { error: movErr } = await supabase
      .from("inventory_movements")
      .delete()
      .in("id", movementIds);
    if (movErr) {
      return {
        ok: false,
        error: t("woPartRemovedMovementFailed", { detail: movErr.message }),
      };
    }
  }
  return { ok: true };
}

/**
 * Move a work order from its current status to `toStatus`. Validates the
 * transition matrix; cancellation requires a reason which is appended to
 * `work_performed` (the WO has no notes column — this is the only free-form
 * audit trail). Mirrors the MO cancel-stamp pattern.
 *
 * Side effects:
 *   - Entering `in_progress` for the first time stamps `started_at = NOW()`.
 *   - Entering `completed` stamps `completed_at = NOW()`. If the WO is linked
 *     to a ticket and the ticket is still in an open lifecycle, the ticket
 *     is auto-advanced to `resolved` (stamping its `resolved_at`).
 *   - Entering `cancelled` appends `[Cancelled YYYY-MM-DD: <reason>]` to
 *     `work_performed`.
 */
export async function transitionWO(
  woId: string,
  toStatus: WorkOrderStatus,
  reason: string | null,
): Promise<WOTransitionResult> {
  const t = await getTranslations("errors");
  if (!woId) return { ok: false, error: t("missingWorkOrderId") };

  const supabase = await createClient();
  const { data: wo, error: lookupErr } = await supabase
    .from("work_orders")
    .select(
      "id, status, started_at, completed_at, work_performed, ticket_id",
    )
    .eq("id", woId)
    .maybeSingle();
  if (lookupErr || !wo) {
    return {
      ok: false,
      error: t("woCouldNotLoad", {
        detail: lookupErr?.message ?? t("notFound"),
      }),
    };
  }

  const fromStatus = wo.status as WorkOrderStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: t("alreadyInState") };
  }
  if (!validNextWOStatuses(fromStatus).includes(toStatus)) {
    return {
      ok: false,
      error: t("woCannotMove", { from: fromStatus, to: toStatus }),
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (woTransitionRequiresReason(toStatus) && trimmedReason === "") {
    return {
      ok: false,
      error: t("reasonRequiredCancel"),
    };
  }

  // Cancelling frees consumed parts back to stock before we flip the status,
  // so a reversal failure aborts the cancel cleanly (rather than leaving a
  // cancelled WO whose parts never came back).
  if (toStatus === "cancelled") {
    const returned = await returnWOPartsToStock(supabase, woId);
    if (!returned.ok) return returned;
  }

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const newStartedAt =
    toStatus === "in_progress" && !wo.started_at ? nowIso : wo.started_at;
  const newCompletedAt =
    toStatus === "completed" && !wo.completed_at ? nowIso : wo.completed_at;

  const newWorkPerformed =
    toStatus === "cancelled" && trimmedReason !== ""
      ? `${wo.work_performed ? `${wo.work_performed}\n` : ""}[Cancelled ${today}: ${trimmedReason}]`.trim()
      : wo.work_performed;

  const { error: updErr } = await supabase
    .from("work_orders")
    .update({
      status: toStatus,
      started_at: newStartedAt,
      completed_at: newCompletedAt,
      work_performed: newWorkPerformed,
      updated_at: nowIso,
    })
    .eq("id", woId);
  if (updErr) {
    return {
      ok: false,
      error: t("woCouldNotUpdateStatus", { detail: updErr.message }),
    };
  }

  // If we just completed a WO and there's a linked ticket still open, mark
  // the ticket resolved. Inline update — same shape as transitionTicket's
  // resolved-stamp logic.
  if (toStatus === "completed" && wo.ticket_id) {
    const { data: ticket } = await supabase
      .from("maintenance_tickets")
      .select("id, status, resolved_at")
      .eq("id", wo.ticket_id)
      .maybeSingle();
    if (
      ticket &&
      OPEN_TICKET_STATUSES.includes(ticket.status as TicketStatus)
    ) {
      await supabase
        .from("maintenance_tickets")
        .update({
          status: "resolved",
          resolved_at: ticket.resolved_at ?? nowIso,
          updated_at: nowIso,
        })
        .eq("id", wo.ticket_id);
      revalidatePath(`/maintenance/tickets/${wo.ticket_id}`);
      revalidatePath("/maintenance/tickets");
    }
  }

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${woId}`);
  revalidatePath(`/work/${woId}`);
  if (toStatus === "cancelled") {
    // Stock changed — refresh the parts surfaces too.
    revalidatePath("/parts");
    revalidatePath(`/work/${woId}/parts`);
  }
  if (wo.ticket_id) {
    revalidatePath(`/maintenance/tickets/${wo.ticket_id}`);
  }
  return { ok: true };
}
