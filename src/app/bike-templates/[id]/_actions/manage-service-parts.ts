"use server";

import { revalidatePath } from "next/cache";

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
  const { data: tpl, error } = await supabase
    .from("bike_templates")
    .select("id, is_current")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !tpl) {
    return {
      ok: false,
      error: `Could not load template: ${error?.message ?? "not found"}`,
    };
  }
  if (!tpl.is_current) {
    return {
      ok: false,
      error: "Paintwork can only be edited on the current version.",
    };
  }
  return { ok: true };
}

function parseQuantity(
  raw: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: "Quantity must be a whole number above zero." };
  }
  return { ok: true, value: n };
}

export async function addTemplatePaintPart(
  templateId: string,
  input: { servicePartTypeId: string; quantity: number },
): Promise<ManagePaintworkResult> {
  if (!templateId) return { ok: false, error: "Missing template id." };
  if (!input.servicePartTypeId) return { ok: false, error: "Pick a part type." };
  const qty = parseQuantity(input.quantity);
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
        error: "That part type is already on the paintwork list — edit its quantity instead.",
      };
    }
    return { ok: false, error: `Could not add paintwork: ${error.message}` };
  }

  revalidatePath(`/bike-templates/${templateId}`);
  return { ok: true };
}

export async function updateTemplatePaintPart(
  templateId: string,
  rowId: string,
  input: { quantity: number },
): Promise<ManagePaintworkResult> {
  if (!templateId || !rowId) {
    return { ok: false, error: "Missing template or row id." };
  }
  const qty = parseQuantity(input.quantity);
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
    return { ok: false, error: `Could not update paintwork: ${error.message}` };
  }

  revalidatePath(`/bike-templates/${templateId}`);
  return { ok: true };
}

export async function removeTemplatePaintPart(
  templateId: string,
  rowId: string,
): Promise<ManagePaintworkResult> {
  if (!templateId || !rowId) {
    return { ok: false, error: "Missing template or row id." };
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
    return { ok: false, error: `Could not remove paintwork: ${error.message}` };
  }

  revalidatePath(`/bike-templates/${templateId}`);
  return { ok: true };
}
