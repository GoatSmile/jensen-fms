"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type ManagePaintworkResult = { ok: true } | { ok: false; error: string };

/**
 * Paintwork declaration lives on the template VERSION row (like the parts
 * recipe), so it's editable only on the current version — past versions are
 * frozen history. Rows are (service part type × per-bike qty); pricing is
 * derived live from the default painter's current list, never stored here.
 */
async function assertCurrentTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getTranslations("errors");
  const { data: tpl, error } = await supabase
    .from("bike_templates")
    .select("id, is_current")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !tpl) {
    return {
      ok: false,
      error: t("tplCouldNotLoad", { detail: error?.message ?? t("notFound") }),
    };
  }
  if (!tpl.is_current) {
    return {
      ok: false,
      error: t("tplPaintworkCurrentOnly"),
    };
  }
  return { ok: true };
}

function parseQuantity(
  raw: unknown,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: t("tplQuantityWholeAboveZero") };
  }
  if (n >= MAX_QTY_PER_BIKE) {
    return { ok: false, error: t("tplPaintQtyPerBikeOnly") };
  }
  return { ok: true, value: n };
}

/**
 * A per-bike count, so a real value is 1 — occasionally 2 (two signs; two
 * mudguards if that type is ever split). Anything at or above this is a BATCH
 * size typed into a per-bike field, which is exactly what happened once: 20 in
 * every row read as "20 frames per bike", multiplied the line AND pushed the
 * tier lookup to 20+, and reported 20 bikes' worth of paint as the per-bike
 * cost. The column header already said "Qty / bike" at the time — a label was
 * not the fix, this is.
 */
const MAX_QTY_PER_BIKE = 10;

export async function addTemplatePaintPart(
  templateId: string,
  input: { servicePartTypeId: string; quantity: number },
): Promise<ManagePaintworkResult> {
  const t = await getTranslations("errors");
  if (!templateId) return { ok: false, error: t("missingTemplateId") };
  if (!input.servicePartTypeId)
    return { ok: false, error: t("tplPickPartType") };
  const qty = parseQuantity(input.quantity, t);
  if (!qty.ok) return qty;

  const supabase = await createClient();
  const guard = await assertCurrentTemplate(supabase, templateId);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("bike_template_service_parts").insert({
    template_id: templateId,
    service_part_type_id: input.servicePartTypeId,
    quantity: qty.value,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: t("tplPaintPartDuplicate"),
      };
    }
    return { ok: false, error: t("tplCouldNotAddPaintwork", { detail: error.message }) };
  }

  revalidatePath(`/bike-templates/${templateId}`);
  return { ok: true };
}

export async function updateTemplatePaintPart(
  templateId: string,
  rowId: string,
  input: { quantity: number },
): Promise<ManagePaintworkResult> {
  const t = await getTranslations("errors");
  if (!templateId || !rowId) {
    return { ok: false, error: t("tplMissingTemplateOrRow") };
  }
  const qty = parseQuantity(input.quantity, t);
  if (!qty.ok) return qty;

  const supabase = await createClient();
  const guard = await assertCurrentTemplate(supabase, templateId);
  if (!guard.ok) return guard;

  const { error } = await supabase
    .from("bike_template_service_parts")
    .update({ quantity: qty.value })
    .eq("id", rowId)
    .eq("template_id", templateId);
  if (error) {
    return { ok: false, error: t("tplCouldNotUpdatePaintwork", { detail: error.message }) };
  }

  revalidatePath(`/bike-templates/${templateId}`);
  return { ok: true };
}

export async function removeTemplatePaintPart(
  templateId: string,
  rowId: string,
): Promise<ManagePaintworkResult> {
  const t = await getTranslations("errors");
  if (!templateId || !rowId) {
    return { ok: false, error: t("tplMissingTemplateOrRow") };
  }

  const supabase = await createClient();
  const guard = await assertCurrentTemplate(supabase, templateId);
  if (!guard.ok) return guard;

  const { error } = await supabase
    .from("bike_template_service_parts")
    .delete()
    .eq("id", rowId)
    .eq("template_id", templateId);
  if (error) {
    return { ok: false, error: t("tplCouldNotRemovePaintwork", { detail: error.message }) };
  }

  revalidatePath(`/bike-templates/${templateId}`);
  return { ok: true };
}
