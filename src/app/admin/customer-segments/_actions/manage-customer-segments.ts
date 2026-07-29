"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable, slugify } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SegmentResult = { ok: true } | { ok: false; error: string };

type ParsedSegment = {
  name_en: string;
  name_da: string | null;
  slug: string;
  description_en: string | null;
  description_da: string | null;
  sort_order: number;
  is_active: boolean;
};


function parseFormData(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; values: ParsedSegment } | { ok: false; error: string } {
  const name_en = nullable(formData.get("name_en"))?.trim();
  if (!name_en) return { ok: false, error: t("englishNameRequired") };

  const name_da = nullable(formData.get("name_da"))?.trim() ?? null;
  const description_en =
    nullable(formData.get("description_en"))?.trim() ?? null;
  const description_da =
    nullable(formData.get("description_da"))?.trim() ?? null;

  const sortOrderRaw = nullable(formData.get("sort_order"));
  let sort_order = 0;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: t("sortOrderNumber") };
    }
    sort_order = Math.trunc(n);
  }

  // Slug pulled from explicit field, else derived from name_en. We use
  // underscores (not dashes) to match the existing seed data convention
  // (facility_management, rental_company, etc.).
  const explicitSlug = nullable(formData.get("slug"))?.trim();
  const slug = slugify(explicitSlug || name_en);
  if (!slug) {
    return { ok: false, error: t("adminSlugFromName") };
  }

  return {
    ok: true,
    values: {
      name_en,
      name_da: name_da || null,
      slug,
      description_en: description_en || null,
      description_da: description_da || null,
      sort_order,
      is_active: formData.get("is_active") === "on",
    },
  };
}

export async function createCustomerSegment(
  formData: FormData,
): Promise<SegmentResult> {
  const t = await getTranslations("errors");
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_segments")
    .insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("slug")
          ? t("adminSegmentSlugExists")
          : t("adminSegmentNameExists"),
      };
    }
    return { ok: false, error: t("couldNotCreate", { detail: error.message }) };
  }
  revalidatePath("/admin/customer-segments");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateCustomerSegment(
  id: string,
  formData: FormData,
): Promise<SegmentResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_segments")
    .update(parsed.values)
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: t("adminSegmentSlugExists"),
      };
    }
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  }
  revalidatePath("/admin/customer-segments");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Toggle active. Soft-archive only — orgs referencing this segment keep
 * their reference; pickers can hide archived rows.
 */
export async function setCustomerSegmentActive(
  id: string,
  isActive: boolean,
): Promise<SegmentResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_segments")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }
  revalidatePath("/admin/customer-segments");
  revalidatePath("/admin");
  return { ok: true };
}
