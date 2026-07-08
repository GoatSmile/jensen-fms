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
 * The version chain is templates with the same (family_id, frame_size) pair,
 * or — when family_id is NULL — same (name_en, frame_size). That's loose enough
 * to handle templates without a family, while still keeping size-based
 * variants (e.g. Norma S vs Norma L) as separate chains.
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
      `id, bike_type_id, family_id, frame_size, name_en, name_da, version,
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

  // Find the highest version in this template chain.
  const maxQuery = supabase
    .from("bike_templates")
    .select("version")
    .eq("frame_size", src.frame_size);
  const maxQueryScoped = src.family_id
    ? maxQuery.eq("family_id", src.family_id)
    : maxQuery.is("family_id", null).eq("name_en", src.name_en);

  const { data: maxRow, error: maxErr } = await maxQueryScoped
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    return {
      ok: false,
      error: `Could not look up versions: ${maxErr.message}`,
    };
  }
  const nextVersion = (maxRow?.version ?? src.version) + 1;

  // Insert the new version row.
  const { data: created, error: insErr } = await supabase
    .from("bike_templates")
    .insert({
      bike_type_id: src.bike_type_id,
      family_id: src.family_id,
      frame_size: src.frame_size,
      name_en: src.name_en,
      name_da: src.name_da,
      notes: src.notes,
      default_retail_price: src.default_retail_price,
      default_retail_currency: src.default_retail_currency,
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
  const demoteQuery = supabase
    .from("bike_templates")
    .update({ is_current: false })
    .eq("frame_size", src.frame_size)
    .neq("id", created.id);
  const demoteScoped = src.family_id
    ? demoteQuery.eq("family_id", src.family_id)
    : demoteQuery.is("family_id", null).eq("name_en", src.name_en);

  const { error: demoteErr } = await demoteScoped;
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
  redirect(`/bike-templates/${created.id}`);
}
