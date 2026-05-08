"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveVariantResult =
  | { ok: true; variantId: string }
  | { ok: false; error: string; field?: string };

export type ToggleVariantResult = { ok: true } | { ok: false; error: string };

type ParsedVariant = {
  sku: string;
  name_en: string;
  name_da: string | null;
  frame_size: string | null;
  color_en: string | null;
  color_da: string | null;
  retail_price: number | null;
  retail_currency: string | null;
  configuration: Record<string, string>;
  is_active: boolean;
};


function parseConfiguration(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    const m = /^cfg_key\[(\d+)\]$/.exec(name);
    if (!m) continue;
    if (typeof value !== "string") continue;
    const k = value.trim();
    const raw = formData.get(`cfg_value[${m[1]}]`);
    const v = typeof raw === "string" ? raw.trim() : "";
    if (k === "" || v === "") continue;
    out[k] = v;
  }
  return out;
}

function parseFields(
  formData: FormData,
): ParsedVariant | { error: string; field?: string } {
  const sku = nullable(formData.get("sku"));
  const name_en = nullable(formData.get("name_en"));
  if (!sku) return { error: "SKU is required.", field: "sku" };
  if (!name_en) return { error: "Variant name (English) is required.", field: "name_en" };

  const priceRaw = nullable(formData.get("retail_price"));
  let retail_price: number | null = null;
  if (priceRaw !== null) {
    const n = Number(priceRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        error: "Retail price must be a non-negative number.",
        field: "retail_price",
      };
    }
    retail_price = n;
  }
  const currencyRaw = nullable(formData.get("retail_currency"));

  return {
    sku,
    name_en,
    name_da: nullable(formData.get("name_da")),
    frame_size: nullable(formData.get("frame_size")),
    color_en: nullable(formData.get("color_en")),
    color_da: nullable(formData.get("color_da")),
    retail_price,
    retail_currency: currencyRaw ? currencyRaw.toUpperCase() : null,
    configuration: parseConfiguration(formData),
    is_active: formData.get("is_active") !== "false",
  };
}

function explainVariantError(err: { code?: string; message: string }): {
  message: string;
  field?: string;
} {
  if (err.code === "23505" && /sku/.test(err.message)) {
    return {
      message: "That SKU is already in use on another variant.",
      field: "sku",
    };
  }
  return { message: err.message };
}

export async function createVariant(
  modelId: string,
  formData: FormData,
): Promise<SaveVariantResult> {
  if (!modelId) return { ok: false, error: "Missing model id." };
  const parsed = parseFields(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bike_model_variants")
    .insert({
      bike_model_id: modelId,
      ...parsed,
    })
    .select("id")
    .single();
  if (error || !data) {
    const e = explainVariantError(error ?? { message: "Unknown error" });
    return { ok: false, error: e.message, field: e.field };
  }

  revalidatePath("/bike-models");
  revalidatePath(`/bike-models/${modelId}`);
  redirect(`/bike-models/${modelId}`);
}

export async function updateVariant(
  modelId: string,
  variantId: string,
  formData: FormData,
): Promise<SaveVariantResult> {
  if (!modelId || !variantId)
    return { ok: false, error: "Missing model id or variant id." };
  const parsed = parseFields(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_model_variants")
    .update({
      ...parsed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", variantId);
  if (error) {
    const e = explainVariantError(error);
    return { ok: false, error: e.message, field: e.field };
  }

  revalidatePath("/bike-models");
  revalidatePath(`/bike-models/${modelId}`);
  redirect(`/bike-models/${modelId}`);
}

/**
 * Soft-deactivation only: variant rows have ON DELETE CASCADE on referenced
 * bikes/templates, so a hard delete would be destructive. Toggling is_active
 * keeps the audit trail.
 */
export async function toggleVariantActive(
  modelId: string,
  variantId: string,
  nextActive: boolean,
): Promise<ToggleVariantResult> {
  if (!modelId || !variantId)
    return { ok: false, error: "Missing model id or variant id." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_model_variants")
    .update({
      is_active: nextActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", variantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bike-models");
  revalidatePath(`/bike-models/${modelId}`);
  return { ok: true };
}
