"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable, slugify } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ServicePartTypeResult = { ok: true } | { ok: false; error: string };

/**
 * `service_part_types` — the part-units a bike can be sent to a supplier for
 * (Frame, Fork, Cargo bed, Mudguards + stays…). Vocabulary for paint-order lines
 * and for a template's paintwork declaration.
 *
 * **Lives here, not under a `/admin/service-part-types` route, because it never
 * had one.** Until 2026-07-29 there was no UI at all — adding "Kickstand" to what
 * a paint order can carry meant writing a migration, which is wrong for pure
 * vocabulary. `/admin/lists` is its only surface, so its actions sit beside that
 * page rather than beside a route that does not exist. (The other seven
 * vocabularies keep their actions under their retired routes; moving those would
 * be churn for no gain.)
 *
 * Deliberately NOT extended to `service_types` (Painting, a future Washing): a
 * new service type needs its own nav item and order routes, so it stays a
 * migration plus code — see CLAUDE.md.
 */
type ParsedPartType = {
  slug: string;
  name_en: string;
  name_da: string;
  sort_order: number;
  is_active: boolean;
};

function parseFormData(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; values: ParsedPartType } | { ok: false; error: string } {
  const name_en = nullable(formData.get("name_en"))?.trim();
  if (!name_en) return { ok: false, error: t("englishNameRequired") };

  // `name_da` is NOT NULL on this table (unlike most vocab), so it falls back to
  // the English name rather than to null — same shape as colours.
  const name_da = nullable(formData.get("name_da"))?.trim() || name_en;

  const explicitSlug = nullable(formData.get("slug"))?.trim();
  const slug = slugify(explicitSlug || name_en);
  if (!slug) return { ok: false, error: t("adminSlugFromName") };

  const sortOrderRaw = nullable(formData.get("sort_order"));
  let sort_order = 0;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isFinite(n)) return { ok: false, error: t("sortOrderNumber") };
    sort_order = Math.trunc(n);
  }

  return {
    ok: true,
    values: {
      slug,
      name_en,
      name_da,
      sort_order,
      is_active: formData.get("is_active") === "on",
    },
  };
}

/** Every surface that offers or prices these needs re-rendering. */
function revalidateAll() {
  revalidatePath("/admin/lists");
  revalidatePath("/admin/services");
  revalidatePath("/paint-orders");
  revalidatePath("/bike-templates/[id]", "page");
}

export async function createServicePartType(
  formData: FormData,
): Promise<ServicePartTypeResult> {
  const t = await getTranslations("errors");
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_part_types")
    .insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: t("adminServicePartTypeExists") };
    }
    return { ok: false, error: t("couldNotCreate", { detail: error.message }) };
  }
  revalidateAll();
  return { ok: true };
}

export async function updateServicePartType(
  id: string,
  formData: FormData,
): Promise<ServicePartTypeResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  // Slug stays stable across renames — it is an internal key, and price-list
  // items reference the id anyway. Listed explicitly rather than destructured
  // away, so it reads as a decision instead of an unused binding.
  const { error } = await supabase
    .from("service_part_types")
    .update({
      name_en: parsed.values.name_en,
      name_da: parsed.values.name_da,
      sort_order: parsed.values.sort_order,
      is_active: parsed.values.is_active,
    })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  }
  revalidateAll();
  return { ok: true };
}

/**
 * Soft-archive. Historical paint-order lines and price-list items keep their
 * reference — this only hides the type from new lines and from the template
 * paintwork picker.
 */
export async function setServicePartTypeActive(
  id: string,
  isActive: boolean,
): Promise<ServicePartTypeResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_part_types")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }
  revalidateAll();
  return { ok: true };
}
