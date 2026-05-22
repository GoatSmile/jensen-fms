"use server";

import { copyMoRecipeToBike } from "../bikes/[bikeId]/build/_actions/manage-bike-parts";
import { finishBikeBuild } from "../bikes/[bikeId]/build/_actions/finish-build";

export type MarkBuiltResult = { ok: true } | { ok: false; error: string };

/**
 * Mark a bike as built — the "no-customisation, recipe is good enough"
 * shortcut for the common case. Two steps:
 *
 *   1. copyMoRecipeToBike — idempotent populate of bike_parts from the
 *      MO recipe (skips if any rows already exist on the bike).
 *   2. finishBikeBuild — consume from inventory per bike_parts row,
 *      stamp build_cost_dkk, transition status → in_stock. Idempotent.
 *
 * Per-bike rows live in `bike_parts` (the source of truth for what each
 * individual bike was built with). If a tech wants to deviate from the
 * recipe for a specific bike, they open the workbench at
 * /manufacturing-orders/<mo>/bikes/<bike>/build and edit the rows
 * before clicking finish — same final code path either way.
 */
export async function markBikeBuilt(
  moId: string,
  bikeId: string,
): Promise<MarkBuiltResult> {
  const seedResult = await copyMoRecipeToBike(moId, bikeId);
  if (!seedResult.ok) return seedResult;

  const finishResult = await finishBikeBuild(moId, bikeId);
  if (!finishResult.ok) {
    return { ok: false, error: finishResult.error };
  }
  return { ok: true };
}
