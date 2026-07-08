"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SavePartResult =
  | { ok: true; partId: string }
  | { ok: false; error: string; field?: string };

type ParsedFields = {
  internal_sku: string;
  name_en: string;
  name_da: string | null;
  description_en: string | null;
  description_da: string | null;
  category_id: string;
  hs_code_id: string | null;
  origin: "eu" | "non_eu" | null;
  tariff_pct_override: number | null;
  unit_of_measure: string;
  default_retail_price: number | null;
  default_retail_currency: string | null;
  weight_grams: number | null;
  reorder_point: number | null;
  reorder_quantity: number | null;
  notes: string | null;
  attributes: Record<string, string>;
};

function parseAttributes(formData: FormData): Record<string, string> {
  // Attributes ride along as paired keys: attr_key[N] / attr_value[N], where N
  // is the row index. Empty key OR empty value drops the row entirely.
  const attrs: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    const m = /^attr_key\[(\d+)\]$/.exec(name);
    if (!m) continue;
    const idx = m[1];
    if (typeof value !== "string") continue;
    const k = value.trim();
    const raw = formData.get(`attr_value[${idx}]`);
    const v = typeof raw === "string" ? raw.trim() : "";
    if (k === "" || v === "") continue;
    attrs[k] = v;
  }
  return attrs;
}

function parseFields(formData: FormData): ParsedFields | { error: string; field?: string } {
  const internal_sku = nullable(formData.get("internal_sku"));
  const name_en = nullable(formData.get("name_en"));
  const category_id = nullable(formData.get("category_id"));
  const unit_of_measure = nullable(formData.get("unit_of_measure"));

  if (!internal_sku) return { error: "SKU is required.", field: "internal_sku" };
  if (!name_en) return { error: "English name is required.", field: "name_en" };
  if (!category_id) return { error: "Category is required.", field: "category_id" };
  if (!unit_of_measure) {
    return { error: "Unit of measure is required.", field: "unit_of_measure" };
  }

  // Optional numerics: empty string → null, otherwise must parse non-negative.
  const priceRaw = nullable(formData.get("default_retail_price"));
  let default_retail_price: number | null = null;
  if (priceRaw !== null) {
    const n = Number(priceRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        error: "Default retail price must be a non-negative number.",
        field: "default_retail_price",
      };
    }
    default_retail_price = n;
  }

  const weightRaw = nullable(formData.get("weight_grams"));
  let weight_grams: number | null = null;
  if (weightRaw !== null) {
    const n = Number(weightRaw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return {
        error: "Weight must be a non-negative whole number of grams.",
        field: "weight_grams",
      };
    }
    weight_grams = n;
  }

  const currencyRaw = nullable(formData.get("default_retail_currency"));
  // Schema allows null currency; UI defaults to DKK but a deliberate blank is OK.
  const default_retail_currency =
    currencyRaw === null ? null : currencyRaw.toUpperCase();

  const reorderPointRaw = nullable(formData.get("reorder_point"));
  let reorder_point: number | null = null;
  if (reorderPointRaw !== null) {
    const n = Number(reorderPointRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        error: "Reorder point must be a non-negative number.",
        field: "reorder_point",
      };
    }
    reorder_point = n;
  }

  const reorderQuantityRaw = nullable(formData.get("reorder_quantity"));
  let reorder_quantity: number | null = null;
  if (reorderQuantityRaw !== null) {
    const n = Number(reorderQuantityRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        error: "Reorder quantity must be a non-negative number.",
        field: "reorder_quantity",
      };
    }
    reorder_quantity = n;
  }

  // hs_code_id is optional; the picker emits "" for "unclassified".
  const hsRaw = nullable(formData.get("hs_code_id"));
  const hs_code_id = hsRaw && hsRaw !== "" ? hsRaw : null;

  // Customs origin — controlled 3-state ("" = unclassified → null). The DB
  // CHECK would reject anything else; validate here for a friendly error.
  const originRaw = nullable(formData.get("origin"));
  if (originRaw !== null && originRaw !== "eu" && originRaw !== "non_eu") {
    return { error: "Origin must be EU or outside EU.", field: "origin" };
  }
  const origin = originRaw;

  // Tariff override (optional). Form holds a percent string ("5" for
  // 5 %, "10.2" for 10.2 %); DB stores the decimal (0.05, 0.102).
  // Blank → no override, fall back to HS code at PO snapshot time.
  let tariff_pct_override: number | null = null;
  const tariffOverrideRaw = nullable(formData.get("tariff_pct_override"));
  if (tariffOverrideRaw) {
    const pct = Number(tariffOverrideRaw.replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return {
        error: "Tariff override must be a number between 0 and 100.",
        field: "tariff_pct_override",
      };
    }
    tariff_pct_override = pct / 100;
  }

  return {
    internal_sku,
    name_en,
    name_da: nullable(formData.get("name_da")),
    description_en: nullable(formData.get("description_en")),
    description_da: nullable(formData.get("description_da")),
    category_id,
    hs_code_id,
    origin,
    tariff_pct_override,
    unit_of_measure,
    default_retail_price,
    default_retail_currency,
    weight_grams,
    reorder_point,
    reorder_quantity,
    notes: nullable(formData.get("notes")),
    attributes: parseAttributes(formData),
  };
}

/**
 * Translate a Postgres error into a friendlier UI message. Today the only
 * one we expect to surface is the unique violation on `parts.internal_sku`.
 */
function explain(err: { code?: string; message: string }): {
  message: string;
  field?: string;
} {
  if (err.code === "23505" && /internal_sku/.test(err.message)) {
    return {
      message: "That SKU is already in use. Pick another.",
      field: "internal_sku",
    };
  }
  return { message: err.message };
}

export async function createPart(formData: FormData): Promise<SavePartResult> {
  const parsed = parseFields(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts")
    .insert({
      internal_sku: parsed.internal_sku,
      name_en: parsed.name_en,
      name_da: parsed.name_da,
      description_en: parsed.description_en,
      description_da: parsed.description_da,
      category_id: parsed.category_id,
      hs_code_id: parsed.hs_code_id,
      origin: parsed.origin,
      tariff_pct_override: parsed.tariff_pct_override,
      unit_of_measure: parsed.unit_of_measure,
      default_retail_price: parsed.default_retail_price,
      default_retail_currency: parsed.default_retail_currency,
      weight_grams: parsed.weight_grams,
      reorder_point: parsed.reorder_point,
      reorder_quantity: parsed.reorder_quantity,
      notes: parsed.notes,
      attributes: parsed.attributes,
    })
    .select("id")
    .single();

  if (error || !data) {
    const e = explain(error ?? { message: "Unknown error" });
    return { ok: false, error: e.message, field: e.field };
  }

  // Optional: seed one preferred supplier offering entered on the create form.
  // Best-effort — the part already exists, so an offering hiccup shouldn't
  // fail creation; the user can add/fix suppliers on the part page. A brand-new
  // part has no offerings, so the (part, supplier) unique index can't collide.
  const supplierId = nullable(formData.get("supplier_id"));
  if (supplierId) {
    const supplierSku = nullable(formData.get("supplier_sku"));
    await supabase.from("part_supplier_offerings").insert({
      part_id: data.id,
      supplier_id: supplierId,
      supplier_sku: supplierSku,
      is_preferred: true,
    });
  }

  revalidatePath("/parts");
  redirect(`/parts/${data.id}`);
}

export async function updatePart(
  partId: string,
  formData: FormData,
): Promise<SavePartResult> {
  if (!partId) return { ok: false, error: "Missing partId." };

  const parsed = parseFields(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { error } = await supabase
    .from("parts")
    .update({
      internal_sku: parsed.internal_sku,
      name_en: parsed.name_en,
      name_da: parsed.name_da,
      description_en: parsed.description_en,
      description_da: parsed.description_da,
      category_id: parsed.category_id,
      hs_code_id: parsed.hs_code_id,
      origin: parsed.origin,
      tariff_pct_override: parsed.tariff_pct_override,
      unit_of_measure: parsed.unit_of_measure,
      default_retail_price: parsed.default_retail_price,
      default_retail_currency: parsed.default_retail_currency,
      weight_grams: parsed.weight_grams,
      reorder_point: parsed.reorder_point,
      reorder_quantity: parsed.reorder_quantity,
      notes: parsed.notes,
      attributes: parsed.attributes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partId);

  if (error) {
    const e = explain(error);
    return { ok: false, error: e.message, field: e.field };
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  redirect(`/parts/${partId}`);
}
