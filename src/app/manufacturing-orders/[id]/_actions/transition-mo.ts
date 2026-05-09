"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  moTransitionRequiresReason,
  validNextMOStatuses,
  type MOStatus,
} from "@/lib/mo/status";

export type MOTransitionResult = { ok: true } | { ok: false; error: string };

/**
 * Move an MO from its current status to `toStatus`. Validates the transition
 * matrix; cancellation requires a reason which gets prepended to the MO's
 * notes for the audit trail (no dedicated mo_state_log exists yet).
 *
 * Stamps actual_start_date when the MO first enters in_progress; stamps
 * actual_completion_date when it lands in 'completed'. Both are advisory.
 */
export async function transitionMO(
  moId: string,
  toStatus: MOStatus,
  reason: string | null,
): Promise<MOTransitionResult> {
  if (!moId) return { ok: false, error: "Missing MO id." };

  const supabase = await createClient();
  const { data: mo, error: lookupErr } = await supabase
    .from("manufacturing_orders")
    .select("id, status, actual_start_date, actual_completion_date, notes")
    .eq("id", moId)
    .maybeSingle();
  if (lookupErr || !mo) {
    return {
      ok: false,
      error: `Could not load MO: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const fromStatus = mo.status as MOStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: "Already in that state." };
  }
  if (!validNextMOStatuses(fromStatus).includes(toStatus)) {
    return { ok: false, error: `Cannot move from "${fromStatus}" to "${toStatus}".` };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (moTransitionRequiresReason(toStatus) && trimmedReason === "") {
    return { ok: false, error: "A reason is required when cancelling an MO." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const newActualStart =
    toStatus === "in_progress" && !mo.actual_start_date
      ? today
      : mo.actual_start_date;
  const newActualCompletion =
    toStatus === "completed" && !mo.actual_completion_date
      ? today
      : mo.actual_completion_date;

  // Append the cancellation reason to notes since we don't have a dedicated
  // log table for MOs. Format: "[Cancelled YYYY-MM-DD: <reason>]\n<existing>".
  const newNotes =
    toStatus === "cancelled" && trimmedReason !== ""
      ? `[Cancelled ${today}: ${trimmedReason}]\n${mo.notes ?? ""}`.trim()
      : mo.notes;

  const { error: updErr } = await supabase
    .from("manufacturing_orders")
    .update({
      status: toStatus,
      actual_start_date: newActualStart,
      actual_completion_date: newActualCompletion,
      notes: newNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", moId);
  if (updErr) {
    return { ok: false, error: `Could not update status: ${updErr.message}` };
  }

  revalidatePath("/manufacturing-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  return { ok: true };
}

/**
 * Auto-advance an MO based on its build progress. Called from markBikeBuilt
 * and bulkMarkBikesBuilt after the build trigger has updated completed_qty.
 *
 *   planned | released   AND  completed_quantity > 0      → in_progress
 *   in_progress           AND  completed_quantity ≥ target → completed
 *
 * Bypasses the user-facing transition matrix (which forbids planned →
 * in_progress directly). The matrix is for the "Move to" dropdown — system-
 * level auto-advancement is a separate path with its own rules. Stamps
 * actual_start_date / actual_completion_date the first time each event fires.
 *
 * Idempotent: re-running on an already-advanced MO is a cheap no-op because
 * the status check guards the update.
 */
export async function autoAdvanceMOAfterBuild(moId: string): Promise<void> {
  if (!moId) return;
  const supabase = await createClient();
  const { data: mo } = await supabase
    .from("manufacturing_orders")
    .select(
      "status, target_quantity, completed_quantity, actual_start_date, actual_completion_date",
    )
    .eq("id", moId)
    .maybeSingle();
  if (!mo) return;

  const status = mo.status as MOStatus;
  const completed = mo.completed_quantity;
  const target = mo.target_quantity;
  const today = new Date().toISOString().slice(0, 10);

  let nextStatus: MOStatus | null = null;
  if ((status === "planned" || status === "released") && completed > 0) {
    nextStatus = "in_progress";
  }
  // Re-check after the planned→in_progress flip in the same pass.
  const effective: MOStatus = nextStatus ?? status;
  if (effective === "in_progress" && completed >= target) {
    nextStatus = "completed";
  }

  if (nextStatus == null) return;

  const updates: {
    status: MOStatus;
    actual_start_date?: string;
    actual_completion_date?: string;
    updated_at: string;
  } = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };
  if (
    (nextStatus === "in_progress" || nextStatus === "completed") &&
    !mo.actual_start_date
  ) {
    updates.actual_start_date = today;
  }
  if (nextStatus === "completed" && !mo.actual_completion_date) {
    updates.actual_completion_date = today;
  }

  await supabase
    .from("manufacturing_orders")
    .update(updates)
    .eq("id", moId);

  revalidatePath("/manufacturing-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
}
