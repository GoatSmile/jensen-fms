"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  transitionRequiresReason,
  validNextStatuses,
  type BikeStatus,
} from "@/lib/bikes/status";

export type TransitionResult = { ok: true } | { ok: false; error: string };

/**
 * Move a bike from its current status to `toStatus`. Validates that the
 * transition is allowed by the lifecycle matrix, optionally requires a
 * reason for terminal moves, and updates the auto-logged `bike_state_log`
 * row with the user-provided reason.
 *
 * The log row itself is written by the `trg_bikes_state_log` Postgres
 * trigger on every status UPDATE — we don't insert our own. After the
 * status update succeeds we patch the just-created log row with our reason
 * (the trigger doesn't capture it).
 */
export async function transitionBike(
  bikeId: string,
  toStatus: BikeStatus,
  reason: string | null,
): Promise<TransitionResult> {
  if (!bikeId) return { ok: false, error: "Missing bike id." };

  const supabase = await createClient();

  const { data: bike, error: lookupErr } = await supabase
    .from("bikes")
    .select("id, status")
    .eq("id", bikeId)
    .maybeSingle();
  if (lookupErr || !bike) {
    return {
      ok: false,
      error: `Could not load bike: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const fromStatus = bike.status as BikeStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: "Bike is already in that state." };
  }

  const allowed = validNextStatuses(fromStatus);
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      error: `Cannot move from "${fromStatus}" to "${toStatus}".`,
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (transitionRequiresReason(toStatus) && trimmedReason === "") {
    return {
      ok: false,
      error: "A reason is required when retiring a bike or marking it lost/stolen.",
    };
  }

  // Update the status first; only log the transition if that succeeded.
  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("bikes")
    .update({
      status: toStatus,
      updated_at: now,
      // Stamp assigned_at on the first transition into 'assigned' so we have
      // a "sold/handed-over" timestamp for the customer phase. If the bike
      // bounces in and out of 'assigned' (rare), the most recent stamp wins.
      ...(toStatus === "assigned" ? { assigned_at: now } : {}),
    })
    .eq("id", bikeId);
  if (updErr) {
    return { ok: false, error: `Could not update status: ${updErr.message}` };
  }

  // The trigger has just appended a (fromStatus, toStatus) log row with
  // reason=NULL. Patch the most recent such row with our reason. If the
  // user didn't supply a reason, leave it null.
  if (trimmedReason !== "") {
    const { data: latest } = await supabase
      .from("bike_state_log")
      .select("id")
      .eq("bike_id", bikeId)
      .eq("from_status", fromStatus)
      .eq("to_status", toStatus)
      .is("reason", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      await supabase
        .from("bike_state_log")
        .update({ reason: trimmedReason })
        .eq("id", latest.id);
    }
  }

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}
