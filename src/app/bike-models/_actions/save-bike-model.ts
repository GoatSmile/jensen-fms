"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveBikeModelResult =
  | { ok: true; modelId: string }
  | { ok: false; error: string; field?: string };

type ParsedFields = {
  bike_type_id: string;
  name_en: string;
  name_da: string | null;
  description_en: string | null;
  description_da: string | null;
  manufacturer: string | null;
  model_year: number | null;
  headline_retail_price: number | null;
  headline_currency: string | null;
  frame_number_code: string | null;
};


function parseFields(
  formData: FormData,
): ParsedFields | { error: string; field?: string } {
  const bike_type_id = nullable(formData.get("bike_type_id"));
  const name_en = nullable(formData.get("name_en"));
  if (!bike_type_id)
    return { error: "Bike type is required.", field: "bike_type_id" };
  if (!name_en) return { error: "English name is required.", field: "name_en" };

  const yearRaw = nullable(formData.get("model_year"));
  let model_year: number | null = null;
  if (yearRaw !== null) {
    const n = Number(yearRaw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1980 || n > 2100) {
      return {
        error: "Model year must be a four-digit year (e.g. 2026).",
        field: "model_year",
      };
    }
    model_year = n;
  }

  const priceRaw = nullable(formData.get("headline_retail_price"));
  let headline_retail_price: number | null = null;
  if (priceRaw !== null) {
    const n = Number(priceRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        error: "Headline retail price must be a non-negative number.",
        field: "headline_retail_price",
      };
    }
    headline_retail_price = n;
  }

  const codeRaw = nullable(formData.get("frame_number_code"));
  let frame_number_code: string | null = null;
  if (codeRaw !== null) {
    const upper = codeRaw.toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(upper)) {
      return {
        error:
          "Frame-number code must be 2–6 letters or digits (no spaces, no symbols).",
        field: "frame_number_code",
      };
    }
    frame_number_code = upper;
  }

  const currencyRaw = nullable(formData.get("headline_currency"));
  return {
    bike_type_id,
    name_en,
    name_da: nullable(formData.get("name_da")),
    description_en: nullable(formData.get("description_en")),
    description_da: nullable(formData.get("description_da")),
    manufacturer: nullable(formData.get("manufacturer")),
    model_year,
    headline_retail_price,
    headline_currency: currencyRaw ? currencyRaw.toUpperCase() : null,
    frame_number_code,
  };
}

export async function createBikeModel(
  formData: FormData,
): Promise<SaveBikeModelResult> {
  const parsed = parseFields(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bike_models")
    .insert(parsed)
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: `Could not save bike model: ${error?.message ?? "unknown error"}`,
    };
  }
  revalidatePath("/bike-models");
  redirect(`/bike-models/${data.id}`);
}

export async function updateBikeModel(
  modelId: string,
  formData: FormData,
): Promise<SaveBikeModelResult> {
  if (!modelId) return { ok: false, error: "Missing model id." };
  const parsed = parseFields(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_models")
    .update({
      ...parsed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", modelId);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/bike-models");
  revalidatePath(`/bike-models/${modelId}`);
  redirect(`/bike-models/${modelId}`);
}
