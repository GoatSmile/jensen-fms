"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { nextFrameNumberSuggestion } from "@/lib/bikes/frame-number";

export type BulkAddResult =
  | { ok: true; created: number }
  | { ok: false; error: string; created: number };

/**
 * Add up to N bikes to an MO at once. Each bike gets a sequentially-suggested
 * frame number based on the model's frame_number_code; we pre-compute the
 * full sequence so we don't race ourselves between iterations.
 *
 * Sequential inserts (not a bulk insert) so the existing addBikeToMO-style
 * logic (state-log trigger, identifier registration, slot-cap check) all
 * stays single-row. If any insert collides on frame_number we abort with a
 * clear "got K of N" message and the user picks up from there.
 */
export async function bulkAddBikesToMO(
  moId: string,
  count: number,
): Promise<BulkAddResult> {
  if (!moId) return { ok: false, error: "Missing MO id.", created: 0 };
  if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0) {
    return {
      ok: false,
      error: "Count must be a positive whole number.",
      created: 0,
    };
  }
  if (count > 100) {
    return {
      ok: false,
      error: "At most 100 bikes per bulk add. Split into multiple runs.",
      created: 0,
    };
  }

  const supabase = await createClient();

  const { data: mo, error: moErr } = await supabase
    .from("manufacturing_orders")
    .select(
      "id, bike_type_id, bike_model_id, bike_model_variant_id, bike_template_id, target_quantity, status",
    )
    .eq("id", moId)
    .maybeSingle();
  if (moErr || !mo) {
    return {
      ok: false,
      error: `Could not load MO: ${moErr?.message ?? "not found"}`,
      created: 0,
    };
  }
  if (mo.status === "completed" || mo.status === "cancelled") {
    return {
      ok: false,
      error: `Cannot add bikes to a ${mo.status} MO.`,
      created: 0,
    };
  }

  const { count: existingBikes } = await supabase
    .from("bikes")
    .select("id", { count: "exact", head: true })
    .eq("manufacturing_order_id", moId)
    .is("deleted_at", null);
  const slotsLeft = mo.target_quantity - (existingBikes ?? 0);
  if (slotsLeft <= 0) {
    return {
      ok: false,
      error: "MO is already at its target quantity. Increase the target to add more.",
      created: 0,
    };
  }
  const toCreate = Math.min(count, slotsLeft);

  // Look up model frame_number_code + every existing frame number for that
  // model so the suggestion helper can find the right sequence.
  const { data: modelRow } = await supabase
    .from("bike_models")
    .select("frame_number_code")
    .eq("id", mo.bike_model_id)
    .maybeSingle();
  const { data: existingFrames } = await supabase
    .from("bikes")
    .select("frame_number")
    .eq("bike_model_id", mo.bike_model_id);

  const existing = (existingFrames ?? []).map((b) => b.frame_number);
  const year = new Date().getFullYear();

  // Pre-compute the full sequence by feeding back each suggestion as we go.
  const planned: string[] = [];
  for (let i = 0; i < toCreate; i++) {
    const next = nextFrameNumberSuggestion({
      year,
      code: modelRow?.frame_number_code ?? null,
      existing: [...existing, ...planned],
    });
    planned.push(next);
  }

  // Identifier-type for frame_number — needed to register each frame_number
  // as a bike_identifier alongside its bike row.
  const { data: idType } = await supabase
    .from("bike_identifier_types")
    .select("id")
    .eq("slug", "frame_number")
    .maybeSingle();

  let created = 0;
  for (const frameNumber of planned) {
    const { data: bike, error: bikeErr } = await supabase
      .from("bikes")
      .insert({
        bike_type_id: mo.bike_type_id,
        bike_model_id: mo.bike_model_id,
        bike_model_variant_id: mo.bike_model_variant_id,
        template_id: mo.bike_template_id,
        manufacturing_order_id: moId,
        frame_number: frameNumber,
        status: "planning",
      })
      .select("id")
      .single();
    if (bikeErr || !bike) {
      return {
        ok: false,
        error: `Created ${created} of ${toCreate} bikes; aborted on frame ${frameNumber}: ${bikeErr?.message ?? "unknown error"}.`,
        created,
      };
    }
    if (idType) {
      await supabase.from("bike_identifiers").insert({
        bike_id: bike.id,
        identifier_type_id: idType.id,
        identifier_value: frameNumber,
      });
    }
    created += 1;
  }

  revalidatePath("/bikes");
  revalidatePath("/manufacturing-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  return { ok: true, created };
}
