"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { loadAtSupplierBikeIds } from "@/lib/services/at-supplier";

import { markBikeBuilt } from "./mark-bike-built";

export type BulkBuiltResult =
  | {
      ok: true;
      built: number;
      /** Total bikes skipped for a reason (not counting "beyond limit"). */
      skipped: number;
      skippedUnconfirmed: number;
      skippedAtPainter: number;
    }
  | { ok: false; error: string; built: number };

/**
 * Mark unbuilt bikes attached to the MO as built — every one of them, or
 * just the next `limit` (in frame-number order) when the workshop finishes
 * a partial batch of a big MO. Loops the per-bike action so the existing
 * inventory-consumption + state-log + MO-completion triggers all run per
 * bike. Sequential, not transactional — partial failures surface a clear
 * "got K of N" message and the user can re-run; the per-bike action no-ops
 * cleanly on already-built bikes.
 *
 * Tier 2 deliberate build: bikes whose real frame number hasn't been
 * confirmed are NOT force-built here — they're skipped and reported. The
 * shortcut can't bypass the per-bike frame confirmation (which happens in
 * the build workbench). `limit` counts only buildable (frame-confirmed)
 * bikes.
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
  const { data: unbuilt, error: candErr } = await supabase
    .from("bikes")
    .select("id, frame_number, frame_number_confirmed")
    .eq("manufacturing_order_id", moId)
    .in("status", ["planning", "building"])
    .is("deleted_at", null)
    .order("frame_number", { ascending: true });
  if (candErr) {
    return {
      ok: false,
      error: `Could not load candidate bikes: ${candErr.message}`,
      built: 0,
    };
  }

  const all = unbuilt ?? [];
  if (all.length === 0) {
    return {
      ok: false,
      error: "No unbuilt bikes attached to this MO.",
      built: 0,
    };
  }

  // Only frame-confirmed bikes can be bulk-built; the rest are skipped.
  const frameConfirmed = all.filter((b) => b.frame_number_confirmed);
  const unconfirmed = all.length - frameConfirmed.length;

  // And a bike physically at the painter can't be built (Tier 2 Phase C) —
  // skipped and reported, just like an unconfirmed frame.
  const atPainterIds = await loadAtSupplierBikeIds(
    supabase,
    frameConfirmed.map((b) => b.id),
  );
  const buildable = frameConfirmed.filter((b) => !atPainterIds.has(b.id));
  const atPainter = frameConfirmed.length - buildable.length;

  if (buildable.length === 0) {
    const reasons: string[] = [];
    if (unconfirmed > 0) reasons.push(`${unconfirmed} need a confirmed frame`);
    if (atPainter > 0) {
      reasons.push(`${atPainter} ${atPainter === 1 ? "is" : "are"} at the painter`);
    }
    return {
      ok: false,
      error: `No bikes are ready to build: ${reasons.join("; ")}.`,
      built: 0,
    };
  }

  const targets = limit != null ? buildable.slice(0, limit) : buildable;

  let built = 0;
  for (const bike of targets) {
    const r = await markBikeBuilt(moId, bike.id);
    if (!r.ok) {
      return {
        ok: false,
        error: `Marked ${built} of ${targets.length} built; aborted on ${bike.frame_number}: ${r.error}`,
        built,
      };
    }
    built += 1;
  }

  revalidatePath("/bikes");
  revalidatePath("/manufacturing-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  revalidatePath("/parts");
  // Skipped = bikes not attempted for a reason (unconfirmed frame or at the
  // painter). Bikes beyond `limit` aren't "skipped", just not reached this
  // round.
  return {
    ok: true,
    built,
    skipped: unconfirmed + atPainter,
    skippedUnconfirmed: unconfirmed,
    skippedAtPainter: atPainter,
  };
}
