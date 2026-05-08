"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { markBikeBuilt } from "./mark-bike-built";

export type BulkBuiltResult =
  | { ok: true; built: number }
  | { ok: false; error: string; built: number };

/**
 * Mark every unbuilt bike attached to the MO as built. Loops the per-bike
 * action so the existing inventory-consumption + state-log + MO-completion
 * triggers all run per bike. Sequential, not transactional — partial failures
 * surface a clear "got K of N" message and the user can re-run; the per-bike
 * action no-ops cleanly on already-built bikes.
 */
export async function bulkMarkBikesBuilt(
  moId: string,
): Promise<BulkBuiltResult> {
  if (!moId) return { ok: false, error: "Missing MO id.", built: 0 };

  const supabase = await createClient();

  // Find unbuilt bikes attached to this MO. "Unbuilt" = planning or building.
  const { data: candidates, error: candErr } = await supabase
    .from("bikes")
    .select("id, frame_number")
    .eq("manufacturing_order_id", moId)
    .in("status", ["planning", "building"])
    .is("deleted_at", null);
  if (candErr) {
    return {
      ok: false,
      error: `Could not load candidate bikes: ${candErr.message}`,
      built: 0,
    };
  }

  if ((candidates ?? []).length === 0) {
    return {
      ok: false,
      error: "No unbuilt bikes attached to this MO.",
      built: 0,
    };
  }

  let built = 0;
  for (const bike of candidates ?? []) {
    const r = await markBikeBuilt(moId, bike.id);
    if (!r.ok) {
      return {
        ok: false,
        error: `Marked ${built} of ${candidates?.length ?? 0} built; aborted on ${bike.frame_number}: ${r.error}`,
        built,
      };
    }
    built += 1;
  }

  revalidatePath("/bikes");
  revalidatePath("/manufacturing-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  revalidatePath("/parts");
  return { ok: true, built };
}
