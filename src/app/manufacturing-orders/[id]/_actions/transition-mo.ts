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
