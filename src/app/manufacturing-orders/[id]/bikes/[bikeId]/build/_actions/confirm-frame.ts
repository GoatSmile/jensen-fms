"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ConfirmFrameResult =
  | { ok: true; frameNumber: string }
  | { ok: false; error: string };

/**
 * Confirm the *real* physical frame number for a bike during the build.
 *
 * MO bikes are auto-created with a provisional placeholder frame (JP-{year}-…)
 * and `frame_number_confirmed = false`. A tech enters the real frame stamped on
 * the bike here; we update the authoritative `bikes.frame_number` (UNIQUE),
 * flip `frame_number_confirmed`, and keep the bike_identifiers frame row in
 * sync so cross-bike search keeps hitting it. finishBikeBuild refuses to
 * consume inventory until this flag is true.
 *
 * Only allowed while the bike is still planning/building — a built bike's
 * frame is already locked in.
 */
export async function confirmBikeFrame(
  moId: string,
  bikeId: string,
  rawFrameNumber: string,
): Promise<ConfirmFrameResult> {
  if (!moId || !bikeId) {
    return { ok: false, error: "Missing MO id or bike id." };
  }
  const frameNumber = (rawFrameNumber ?? "").trim();
  if (frameNumber === "") {
    return { ok: false, error: "Enter the real frame number." };
  }

  const supabase = await createClient();

  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, status, manufacturing_order_id, frame_number")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr || !bike) {
    return {
      ok: false,
      error: `Could not load bike: ${bikeErr?.message ?? "not found"}`,
    };
  }
  if (bike.manufacturing_order_id !== moId) {
    return { ok: false, error: "That bike doesn't belong to this MO." };
  }
  if (bike.status !== "planning" && bike.status !== "building") {
    return {
      ok: false,
      error: "The frame can only be confirmed while the bike is still being built.",
    };
  }

  const previousFrame = bike.frame_number;
  const frameChanged = previousFrame !== frameNumber;

  const { error: updErr } = await supabase
    .from("bikes")
    .update({
      frame_number: frameNumber,
      frame_number_confirmed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bikeId);
  if (updErr) {
    if (updErr.code === "23505") {
      return {
        ok: false,
        error: "That frame number is already on file for another bike.",
      };
    }
    return { ok: false, error: `Could not confirm frame: ${updErr.message}` };
  }

  // Keep the bike_identifiers frame row in sync. bikes.frame_number is
  // authoritative, but the confirmed flag is the ONLY thing finishBikeBuild
  // gates on — so a silent sync failure would let inventory be consumed for a
  // bike whose frame identifier is stale/missing. If the sync fails we roll the
  // bikes update back to provisional so the flag and the identifier never drift.
  if (frameChanged) {
    const { data: idType } = await supabase
      .from("bike_identifier_types")
      .select("id")
      .eq("slug", "frame_number")
      .maybeSingle();
    if (idType) {
      const { data: existing } = await supabase
        .from("bike_identifiers")
        .select("id")
        .eq("bike_id", bikeId)
        .eq("identifier_type_id", idType.id)
        .eq("is_active", true)
        .maybeSingle();
      const { error: syncErr } = existing
        ? await supabase
            .from("bike_identifiers")
            .update({ identifier_value: frameNumber })
            .eq("id", existing.id)
        : await supabase.from("bike_identifiers").insert({
            bike_id: bikeId,
            identifier_type_id: idType.id,
            identifier_value: frameNumber,
          });
      if (syncErr) {
        // Roll back so we never leave frame_number_confirmed = true with a
        // stale identifier (the build gate would otherwise pass).
        await supabase
          .from("bikes")
          .update({
            frame_number: previousFrame,
            frame_number_confirmed: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", bikeId);
        return {
          ok: false,
          error:
            syncErr.code === "23505"
              ? "That frame number is already registered as an identifier on another bike."
              : `Could not sync the frame identifier: ${syncErr.message}`,
        };
      }
    }
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/manufacturing-orders/${moId}`);
  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath("/bikes");
  return { ok: true, frameNumber };
}
