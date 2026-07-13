"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("errors");
  if (!templateId) return { ok: false, error: t("missingTemplateId") };

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
      error: t("tplCouldNotLoadSource", {
        detail: srcErr?.message ?? t("notFound"),
      }),
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
      error: t("tplCouldNotLookUpVersions", { detail: maxErr.message }),
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
      error: t("tplCouldNotCreateVersion", {
        detail: insErr?.message ?? t("unknownError"),
      }),
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
      error: t("tplVersionCreatedDemoteFailed", {
        id: created.id,
        detail: demoteErr.message,
      }),
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
        error: t("tplVersionCreatedPartsFailed", { detail: partsErr.message }),
      };
    }
  }

  // Carry the paintwork declaration forward (copied as-saved from the DB —
  // it isn't part of the editor state the way the parts list is).
  const { data: paintRows } = await supabase
    .from("bike_template_service_parts")
    .select("service_part_type_id, quantity")
    .eq("template_id", templateId);
  if (paintRows && paintRows.length > 0) {
    const { error: paintErr } = await supabase
      .from("bike_template_service_parts")
      .insert(
        paintRows.map((p) => ({
          template_id: created.id,
          service_part_type_id: p.service_part_type_id,
          quantity: p.quantity,
        })),
      );
    if (paintErr) {
      return {
        ok: false,
        error: t("tplVersionCreatedPaintFailed", { detail: paintErr.message }),
      };
    }
  }

  revalidatePath("/bike-templates");
  revalidatePath(`/bike-templates/${templateId}`);
  revalidatePath(`/bike-templates/${created.id}`);
  redirect(`/bike-templates/${created.id}`);
}
