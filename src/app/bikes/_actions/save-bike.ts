"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveBikeResult =
  | { ok: true; bikeId: string }
  | { ok: false; error: string; field?: string };

type ParsedFields = {
  bike_type_id: string;
  bike_model_id: string | null;
  bike_model_variant_id: string | null;
  template_id: string | null;
  frame_number: string;
  notes: string | null;
};

function parseFields(
  formData: FormData,
): ParsedFields | { error: string; field?: string } {
  const bike_type_id = nullable(formData.get("bike_type_id"));
  const frame_number = nullable(formData.get("frame_number"));
  if (!bike_type_id)
    return { error: "Bike type is required.", field: "bike_type_id" };
  if (!frame_number)
    return { error: "Frame number is required.", field: "frame_number" };

  return {
    bike_type_id,
    bike_model_id: nullable(formData.get("bike_model_id")),
    bike_model_variant_id: nullable(formData.get("bike_model_variant_id")),
    template_id: nullable(formData.get("template_id")),
    frame_number,
    notes: nullable(formData.get("notes")),
  };
}

function explainBikeError(err: { code?: string; message: string }): {
  message: string;
  field?: string;
} {
  if (err.code === "23505" && /frame_number/.test(err.message)) {
    return {
      message: "That frame number is already on file for another bike.",
      field: "frame_number",
    };
  }
  return { message: err.message };
}

/**
 * Manual bike creation (one-offs, demos, refurb candidates). The MO build
 * flow in Phase 2C will create bikes directly from a manufacturing order
 * and won't go through this path.
 *
 * The bike starts in `planning` state. The 5 lifecycle identifiers (frame,
 * lock, etc.) are registered as separate actions in 2B.2.
 */
export async function createBike(
  formData: FormData,
): Promise<SaveBikeResult> {
  const parsed = parseFields(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();

  // Insert the bike row.
  const { data: bike, error } = await supabase
    .from("bikes")
    .insert({
      bike_type_id: parsed.bike_type_id,
      bike_model_id: parsed.bike_model_id,
      bike_model_variant_id: parsed.bike_model_variant_id,
      template_id: parsed.template_id,
      frame_number: parsed.frame_number,
      status: "planning",
      notes: parsed.notes,
    })
    .select("id")
    .single();

  if (error || !bike) {
    const e = explainBikeError(error ?? { message: "Unknown error" });
    return { ok: false, error: e.message, field: e.field };
  }

  // Also register the frame number as a bike_identifier so search/lookup
  // works. We need the frame-number identifier_type_id by slug.
  const { data: idType } = await supabase
    .from("bike_identifier_types")
    .select("id")
    .eq("slug", "frame_number")
    .maybeSingle();
  if (idType) {
    await supabase.from("bike_identifiers").insert({
      bike_id: bike.id,
      identifier_type_id: idType.id,
      identifier_value: parsed.frame_number,
    });
  }

  // bike_state_log row is written automatically by the `trg_bikes_state_log`
  // trigger on every INSERT and status UPDATE; we don't need to write our own.

  revalidatePath("/bikes");
  redirect(`/bikes/${bike.id}`);
}
