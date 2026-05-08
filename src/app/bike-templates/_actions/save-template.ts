"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveTemplateResult =
  | { ok: true; templateId: string }
  | { ok: false; error: string; field?: string };

type ParsedShell = {
  bike_model_id: string;
  bike_model_variant_id: string | null;
  bike_type_id: string;
  name_en: string;
  name_da: string | null;
  notes: string | null;
};

async function parseAndResolveShell(
  formData: FormData,
): Promise<ParsedShell | { error: string; field?: string }> {
  const bike_model_id = nullable(formData.get("bike_model_id"));
  const variantRaw = nullable(formData.get("bike_model_variant_id"));
  const name_en = nullable(formData.get("name_en"));

  if (!bike_model_id)
    return { error: "Bike model is required.", field: "bike_model_id" };
  if (!name_en)
    return { error: "Template name (English) is required.", field: "name_en" };

  // bike_type_id is derived from the model — we look it up so the caller doesn't
  // have to keep model + type in sync in the form.
  const supabase = await createClient();
  const { data: model, error: modelErr } = await supabase
    .from("bike_models")
    .select("id, bike_type_id")
    .eq("id", bike_model_id)
    .maybeSingle();
  if (modelErr) return { error: `Could not load model: ${modelErr.message}` };
  if (!model) return { error: "Bike model not found.", field: "bike_model_id" };

  return {
    bike_model_id: model.id,
    bike_model_variant_id:
      variantRaw && variantRaw !== "all" ? variantRaw : null,
    bike_type_id: model.bike_type_id,
    name_en,
    name_da: nullable(formData.get("name_da")),
    notes: nullable(formData.get("notes")),
  };
}

export async function createTemplate(
  formData: FormData,
): Promise<SaveTemplateResult> {
  const parsed = await parseAndResolveShell(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bike_templates")
    .insert({
      bike_model_id: parsed.bike_model_id,
      bike_model_variant_id: parsed.bike_model_variant_id,
      bike_type_id: parsed.bike_type_id,
      name_en: parsed.name_en,
      name_da: parsed.name_da,
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
  revalidatePath(`/bike-models/${parsed.bike_model_id}`);
  redirect(`/bike-templates/${data.id}`);
}

export async function updateTemplate(
  templateId: string,
  formData: FormData,
): Promise<SaveTemplateResult> {
  if (!templateId) return { ok: false, error: "Missing template id." };
  // Edit-shell only mutates name + notes; model/variant/type are baked in at
  // creation. To re-target a template, save it as a new version on a different
  // model — that's the right semantic, not an edit.
  const name_en = nullable(formData.get("name_en"));
  if (!name_en)
    return { ok: false, error: "Template name (English) is required.", field: "name_en" };

  const supabase = await createClient();
  const { data: existing, error: lookupErr } = await supabase
    .from("bike_templates")
    .select("bike_model_id")
    .eq("id", templateId)
    .maybeSingle();
  if (lookupErr || !existing) {
    return {
      ok: false,
      error: `Could not load template: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const { error } = await supabase
    .from("bike_templates")
    .update({
      name_en,
      name_da: nullable(formData.get("name_da")),
      notes: nullable(formData.get("notes")),
    })
    .eq("id", templateId);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  revalidatePath("/bike-templates");
  revalidatePath(`/bike-templates/${templateId}`);
  revalidatePath(`/bike-models/${existing.bike_model_id}`);
  redirect(`/bike-templates/${templateId}`);
}
