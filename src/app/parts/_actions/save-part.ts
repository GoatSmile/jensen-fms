"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { readPersonId } from "@/lib/auth/read-session";
import { createClient } from "@/lib/supabase/server";

export type SavePartResult =
  { ok: true; partId: string } | { ok: false; error: string; field?: string };

type ParsedFields = {
  internal_sku: string;
  name_en: string;
  name_da: string | null;
  description_en: string | null;
  description_da: string | null;
  category_id: string;
  hs_code_id: string | null;
  origin: "eu" | "non_eu" | null;
  service_part_type_id: string | null;
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

function parseFields(
  formData: FormData,
): ParsedFields | { errorKey: string; field?: string } {
  const internal_sku = nullable(formData.get("internal_sku"));
  const name_en = nullable(formData.get("name_en"));
  const category_id = nullable(formData.get("category_id"));
  const unit_of_measure = nullable(formData.get("unit_of_measure"));

  if (!internal_sku)
    return { errorKey: "partSkuRequired", field: "internal_sku" };
  if (!name_en) return { errorKey: "englishNameRequired", field: "name_en" };
  if (!category_id)
    return { errorKey: "partCategoryRequired", field: "category_id" };
  if (!unit_of_measure) {
    return { errorKey: "partUnitOfMeasureRequired", field: "unit_of_measure" };
  }

  // Optional numerics: empty string → null, otherwise must parse non-negative.
  const priceRaw = nullable(formData.get("default_retail_price"));
  let default_retail_price: number | null = null;
  if (priceRaw !== null) {
    const n = Number(priceRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        errorKey: "partRetailPriceNonNegative",
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
        errorKey: "partWeightWholeGrams",
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
        errorKey: "partReorderPointNonNegative",
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
        errorKey: "partReorderQtyNonNegative",
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
    return { errorKey: "partOriginInvalid", field: "origin" };
  }
  const origin = originRaw;

  // Paintable as — the picker emits "" for "never painted".
  const paintRaw = nullable(formData.get("service_part_type_id"));
  const service_part_type_id = paintRaw && paintRaw !== "" ? paintRaw : null;

  // Tariff override (optional). Form holds a percent string ("5" for
  // 5 %, "10.2" for 10.2 %); DB stores the decimal (0.05, 0.102).
  // Blank → no override, fall back to HS code at PO snapshot time.
  let tariff_pct_override: number | null = null;
  const tariffOverrideRaw = nullable(formData.get("tariff_pct_override"));
  if (tariffOverrideRaw) {
    const pct = Number(tariffOverrideRaw.replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return {
        errorKey: "partTariffOverrideRange",
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
    service_part_type_id,
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
function explain(err: {
  code?: string;
  message: string;
}): { messageKey: string; field?: string } | { message: string } {
  if (err.code === "23505" && /internal_sku/.test(err.message)) {
    return {
      messageKey: "partSkuInUse",
      field: "internal_sku",
    };
  }
  return { message: err.message };
}

export async function createPart(formData: FormData): Promise<SavePartResult> {
  const t = await getTranslations("errors");
  const parsed = parseFields(formData);
  if ("errorKey" in parsed)
    return { ok: false, error: t(parsed.errorKey), field: parsed.field };

  const supabase = await createClient();

  const personId = await readPersonId();
  const { data, error } = await supabase
    .from("parts")
    .insert({
      last_actor_id: personId,
      internal_sku: parsed.internal_sku,
      name_en: parsed.name_en,
      name_da: parsed.name_da,
      description_en: parsed.description_en,
      description_da: parsed.description_da,
      category_id: parsed.category_id,
      hs_code_id: parsed.hs_code_id,
      origin: parsed.origin,
      service_part_type_id: parsed.service_part_type_id,
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
    const e = explain(error ?? { message: t("unknownError") });
    if ("messageKey" in e)
      return { ok: false, error: t(e.messageKey), field: e.field };
    return { ok: false, error: e.message };
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
  const t = await getTranslations("errors");
  if (!partId) return { ok: false, error: t("missingPartId") };

  const parsed = parseFields(formData);
  if ("errorKey" in parsed)
    return { ok: false, error: t(parsed.errorKey), field: parsed.field };

  const supabase = await createClient();
  const personId = await readPersonId();
  const { error } = await supabase
    .from("parts")
    .update({
      last_actor_id: personId,
      internal_sku: parsed.internal_sku,
      name_en: parsed.name_en,
      name_da: parsed.name_da,
      description_en: parsed.description_en,
      description_da: parsed.description_da,
      category_id: parsed.category_id,
      hs_code_id: parsed.hs_code_id,
      origin: parsed.origin,
      service_part_type_id: parsed.service_part_type_id,
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
    if ("messageKey" in e)
      return { ok: false, error: t(e.messageKey), field: e.field };
    return { ok: false, error: e.message };
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  redirect(`/parts/${partId}`);
}
