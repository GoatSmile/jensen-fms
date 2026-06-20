"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type CoatingResult = { ok: true } | { ok: false; error: string };

type ParsedCoating = {
  slug: string;
  label_en: string;
  label_da: string;
  sort_order: number;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFormData(
  formData: FormData,
): { ok: true; values: ParsedCoating } | { ok: false; error: string } {
  const label_en = nullable(formData.get("label_en"))?.trim();
  if (!label_en) return { ok: false, error: "English label is required." };
  const label_da = nullable(formData.get("label_da"))?.trim() || label_en;

  const explicitSlug = nullable(formData.get("slug"))?.trim();
  const slug = slugify(explicitSlug || label_en);
  if (!slug) {
    return { ok: false, error: "Could not generate a slug from the label." };
  }

  const sortOrderRaw = nullable(formData.get("sort_order"));
  let sort_order = 0;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Sort order must be a number." };
    }
    sort_order = Math.trunc(n);
  }

  return { ok: true, values: { slug, label_en, label_da, sort_order } };
}

export async function createCoating(
  formData: FormData,
): Promise<CoatingResult> {
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("coatings").insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A finish with that name already exists." };
    }
    return { ok: false, error: `Could not create: ${error.message}` };
  }
  revalidatePath("/admin/colors");
  return { ok: true };
}

export async function updateCoating(
  id: string,
  formData: FormData,
): Promise<CoatingResult> {
  if (!id) return { ok: false, error: "Missing id." };
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("coatings")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A finish with that name already exists." };
    }
    return { ok: false, error: `Could not update: ${error.message}` };
  }
  revalidatePath("/admin/colors");
  return { ok: true };
}

/**
 * Toggle active. Soft-archive only — colours that already store this finish's
 * slug keep their value; it just drops out of the picker.
 */
export async function setCoatingActive(
  id: string,
  isActive: boolean,
): Promise<CoatingResult> {
  if (!id) return { ok: false, error: "Missing id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("coatings")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/admin/colors");
  return { ok: true };
}
