"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { markBikeBuilt } from "./mark-bike-built";

export type BulkBuiltResult =
  | { ok: true; built: number }
  | { ok: false; error: string; built: number };

/**
 * Mark unbuilt bikes attached to the MO as built — every one of them, or
 * just the next `limit` (in frame-number order) when the workshop finishes
 * a partial batch of a big MO. Loops the per-bike action so the existing
 * inventory-consumption + state-log + MO-completion triggers all run per
 * bike. Sequential, not transactional — partial failures surface a clear
 * "got K of N" message and the user can re-run; the per-bike action no-ops
 * cleanly on already-built bikes.
 */
export async function bulkMarkBikesBuilt(
  moId: string,
  limit?: number,
): Promise<BulkBuiltResult> {
  if (!moId) return { ok: false, error: "Missing MO id.", built: 0 };
  if (
    limit != null &&
    (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0)
  ) {
    return {
      ok: false,
      error: "Count must be a positive whole number.",
      built: 0,
    };
  }

  const supabase = await createClient();

  // Find unbuilt bikes attached to this MO. "Unbuilt" = planning or building.
  let query = supabase
    .from("bikes")
    .select("id, frame_number")
    .eq("manufacturing_order_id", moId)
    .in("status", ["planning", "building"])
    .is("deleted_at", null)
    .order("frame_number", { ascending: true });
  if (limit != null) query = query.limit(limit);
  const { data: candidates, error: candErr } = await query;
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
