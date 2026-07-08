"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveTemplateResult =
  | { ok: true; templateId: string }
  | { ok: false; error: string; field?: string };

type ParsedShell = {
  bike_type_id: string;
  family_id: string | null;
  frame_size: string;
  name_en: string;
  name_da: string | null;
  default_retail_price: number | null;
  default_retail_currency: string | null;
  notes: string | null;
};

function parsePrice(
  raw: string | null,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: null };
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Price must be a non-negative number." };
  }
  return { ok: true, value: n };
}

function parseShell(
  formData: FormData,
): ParsedShell | { error: string; field?: string } {
  const bike_type_id = nullable(formData.get("bike_type_id"));
  const frame_size = nullable(formData.get("frame_size"));
  const name_en = nullable(formData.get("name_en"));

  if (!bike_type_id)
    return { error: "Bike type is required.", field: "bike_type_id" };
  if (!frame_size)
    return { error: "Frame size is required.", field: "frame_size" };
  if (!name_en)
    return { error: "Template name (English) is required.", field: "name_en" };

  const priceParsed = parsePrice(nullable(formData.get("default_retail_price")));
  if (!priceParsed.ok)
    return { error: priceParsed.error, field: "default_retail_price" };

  return {
    bike_type_id,
    family_id: nullable(formData.get("family_id")),
    frame_size,
    name_en,
    name_da: nullable(formData.get("name_da")),
    default_retail_price: priceParsed.value,
    default_retail_currency:
      priceParsed.value == null
        ? null
        : nullable(formData.get("default_retail_currency")) ?? "DKK",
    notes: nullable(formData.get("notes")),
  };
}

export async function createTemplate(
  formData: FormData,
): Promise<SaveTemplateResult> {
  const parsed = parseShell(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bike_templates")
    .insert({
      bike_type_id: parsed.bike_type_id,
      family_id: parsed.family_id,
      frame_size: parsed.frame_size,
      name_en: parsed.name_en,
      name_da: parsed.name_da,
      default_retail_price: parsed.default_retail_price,
      default_retail_currency: parsed.default_retail_currency,
      notes: parsed.notes,
      version: 1,
      is_current: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: `Could not create template: ${error?.message ?? "unknown error"}`,
    };
  }
  revalidatePath("/bike-templates");
  redirect(`/bike-templates/${data.id}`);
}

export async function updateTemplate(
  templateId: string,
  formData: FormData,
): Promise<SaveTemplateResult> {
  if (!templateId) return { ok: false, error: "Missing template id." };
  // Edit-shell mutates everything except bike_type_id (kept stable to preserve
  // history). Frame size CAN change on edit — if you really need a different
  // size, you almost always want a new template instead, but we don't enforce.
  const frame_size = nullable(formData.get("frame_size"));
  const name_en = nullable(formData.get("name_en"));
  if (!frame_size)
    return {
      ok: false,
      error: "Frame size is required.",
      field: "frame_size",
    };
  if (!name_en)
    return {
      ok: false,
      error: "Template name (English) is required.",
      field: "name_en",
    };

  const priceParsed = parsePrice(nullable(formData.get("default_retail_price")));
  if (!priceParsed.ok)
    return {
      ok: false,
      error: priceParsed.error,
      field: "default_retail_price",
    };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_templates")
    .update({
      family_id: nullable(formData.get("family_id")),
      frame_size,
      name_en,
      name_da: nullable(formData.get("name_da")),
      default_retail_price: priceParsed.value,
      default_retail_currency:
        priceParsed.value == null
          ? null
          : nullable(formData.get("default_retail_currency")) ?? "DKK",
      notes: nullable(formData.get("notes")),
    })
    .eq("id", templateId);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  revalidatePath("/bike-templates");
  revalidatePath(`/bike-templates/${templateId}`);
  redirect(`/bike-templates/${templateId}`);
}
