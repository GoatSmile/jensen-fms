"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type CloneResult =
  | { ok: true; newTemplateId: string }
  | { ok: false; error: string };

/**
 * Save-as-new-version: insert a new bike_templates row with version+1, copy
 * the current parts list as the starting point, demote the previous version's
 * is_current flag.
 *
 * The given `parts` argument is the in-progress list from the editor —
 * if the user changed the recipe before clicking "Save as new version", those
 * changes land on the new version, leaving the old version untouched. If the
 * user just clicked "Save as new version" without changes, the parts list is
 * a faithful copy.
 */
export async function cloneAsNewVersion(
  templateId: string,
  parts: Array<{
    partId: string;
    quantity: number;
    isOptional: boolean;
    notes: string | null;
  }>,
): Promise<CloneResult> {
  if (!templateId) return { ok: false, error: "Missing template id." };

  const supabase = await createClient();

  const { data: src, error: srcErr } = await supabase
    .from("bike_templates")
    .select(
      "id, bike_model_id, bike_model_variant_id, bike_type_id, name_en, name_da, version, notes",
    )
    .eq("id", templateId)
    .maybeSingle();
  if (srcErr || !src) {
    return {
      ok: false,
      error: `Could not load source template: ${srcErr?.message ?? "not found"}`,
    };
  }

  // Find the highest version in this template chain.
  const { data: maxRow, error: maxErr } = await supabase
    .from("bike_templates")
    .select("version")
    .eq("bike_model_id", src.bike_model_id)
    .filter(
      "bike_model_variant_id",
      src.bike_model_variant_id == null ? "is" : "eq",
      src.bike_model_variant_id == null ? null : src.bike_model_variant_id,
    )
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    return { ok: false, error: `Could not look up versions: ${maxErr.message}` };
  }
  const nextVersion = (maxRow?.version ?? src.version) + 1;

  // Insert the new version row.
  const { data: created, error: insErr } = await supabase
    .from("bike_templates")
    .insert({
      bike_model_id: src.bike_model_id,
      bike_model_variant_id: src.bike_model_variant_id,
      bike_type_id: src.bike_type_id,
      name_en: src.name_en,
      name_da: src.name_da,
      notes: src.notes,
      version: nextVersion,
      is_current: true,
    })
    .select("id")
    .single();
  if (insErr || !created) {
    return {
      ok: false,
      error: `Could not create new version: ${insErr?.message ?? "unknown error"}`,
    };
  }

  // Demote previous current version(s) in this chain.
  const { error: demoteErr } = await supabase
    .from("bike_templates")
    .update({ is_current: false })
    .eq("bike_model_id", src.bike_model_id)
    .filter(
      "bike_model_variant_id",
      src.bike_model_variant_id == null ? "is" : "eq",
      src.bike_model_variant_id == null ? null : src.bike_model_variant_id,
    )
    .neq("id", created.id);
  if (demoteErr) {
    return {
      ok: false,
      error: `New version created (${created.id}) but could not demote prior version: ${demoteErr.message}`,
    };
  }

  // Seed the parts list on the new version.
  if (parts.length > 0) {
    const { error: partsErr } = await supabase
      .from("bike_template_parts")
      .insert(
        parts.map((p) => ({
          template_id: created.id,
          part_id: p.partId,
          quantity: p.quantity,
          is_optional: p.isOptional,
          notes: p.notes,
        })),
      );
    if (partsErr) {
      return {
        ok: false,
        error: `New version created but parts didn't seed: ${partsErr.message}. Open the new version and add parts manually.`,
      };
    }
  }

  revalidatePath("/bike-templates");
  revalidatePath(`/bike-templates/${templateId}`);
  revalidatePath(`/bike-templates/${created.id}`);
  revalidatePath(`/bike-models/${src.bike_model_id}`);
  redirect(`/bike-templates/${created.id}`);
}
