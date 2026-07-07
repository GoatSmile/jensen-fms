"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type DuplicateResult = { ok: false; error: string };
// On success this redirects and never returns a value.

/**
 * Duplicate a template into a brand-new, independent one — NOT a new version.
 *
 * Unlike `cloneAsNewVersion` (which bumps version within the same
 * family/size chain and demotes the old current), this creates a fresh
 * template at version 1, `is_current = true`, named "<name> (copy)", carrying
 * the same family/frame-size/bike-type/retail so the user can then change one
 * thing (e.g. the frame) and save. The source is left untouched, and because
 * the copy's name differs it stands on its own rather than joining the
 * source's version chain.
 *
 * The saved recipe (`bike_template_parts`) is copied from the DB — this
 * duplicates the template as-saved, so any unsaved edits in an open editor are
 * intentionally not included.
 */
export async function duplicateTemplate(templateId: string): Promise<DuplicateResult> {
  if (!templateId) return { ok: false, error: "Missing template id." };

  const supabase = await createClient();

  const { data: src, error: srcErr } = await supabase
    .from("bike_templates")
    .select(
      `bike_type_id, family, frame_size, name_en, name_da,
       notes, default_retail_price, default_retail_currency`,
    )
    .eq("id", templateId)
    .maybeSingle();
  if (srcErr || !src) {
    return {
      ok: false,
      error: `Could not load source template: ${srcErr?.message ?? "not found"}`,
    };
  }

  const { data: created, error: insErr } = await supabase
    .from("bike_templates")
    .insert({
      bike_type_id: src.bike_type_id,
      family: src.family,
      frame_size: src.frame_size,
      name_en: `${src.name_en} (copy)`,
      name_da: src.name_da ? `${src.name_da} (kopi)` : null,
      notes: src.notes,
      default_retail_price: src.default_retail_price,
      default_retail_currency: src.default_retail_currency,
      version: 1,
      is_current: true,
    })
    .select("id")
    .single();
  if (insErr || !created) {
    return {
      ok: false,
      error: `Could not create the copy: ${insErr?.message ?? "unknown error"}`,
    };
  }

  // Copy the saved recipe onto the new template.
  const { data: srcParts, error: partsReadErr } = await supabase
    .from("bike_template_parts")
    .select("part_id, quantity, is_optional, notes")
    .eq("template_id", templateId);
  if (partsReadErr) {
    return {
      ok: false,
      error: `Copy created (${created.id}) but could not read the source recipe: ${partsReadErr.message}`,
    };
  }

  if (srcParts && srcParts.length > 0) {
    const { error: partsErr } = await supabase
      .from("bike_template_parts")
      .insert(
        srcParts.map((p) => ({
          template_id: created.id,
          part_id: p.part_id,
          quantity: p.quantity,
          is_optional: p.is_optional,
          notes: p.notes,
        })),
      );
    if (partsErr) {
      return {
        ok: false,
        error: `Copy created but its recipe didn't seed: ${partsErr.message}. Open the copy and add parts manually.`,
      };
    }
  }

  revalidatePath("/bike-templates");
  revalidatePath(`/bike-templates/${created.id}`);
  redirect(`/bike-templates/${created.id}`);
}
