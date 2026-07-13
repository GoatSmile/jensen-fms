"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type LocationResult = { ok: true } | { ok: false; error: string };

type ParsedLocation = {
  code: string;
  name_en: string;
  name_da: string | null;
  address: string | null;
  is_active: boolean;
};

function parseFormData(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; values: ParsedLocation } | { ok: false; error: string } {
  const code = nullable(formData.get("code"))?.trim();
  if (!code) return { ok: false, error: t("adminCodeRequired") };

  const name_en = nullable(formData.get("name_en"))?.trim();
  if (!name_en) return { ok: false, error: t("englishNameRequired") };

  const name_da = nullable(formData.get("name_da"))?.trim() || null;
  const address = nullable(formData.get("address"))?.trim() || null;

  return {
    ok: true,
    values: {
      code,
      name_en,
      name_da,
      address,
      is_active: formData.get("is_active") === "on",
    },
  };
}

export async function createLocation(
  formData: FormData,
): Promise<LocationResult> {
  const t = await getTranslations("errors");
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_locations")
    .insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: t("adminLocationCodeExists", { code: parsed.values.code }),
      };
    }
    return { ok: false, error: t("couldNotCreate", { detail: error.message }) };
  }
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateLocation(
  id: string,
  formData: FormData,
): Promise<LocationResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_locations")
    .update(parsed.values)
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: t("adminLocationCodeExists", { code: parsed.values.code }),
      };
    }
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  }
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Flip the app-wide "hide location info" flag from the Locations screen —
 * the flag's only control since location config moved off /admin/settings.
 * Touches only hide_location_info, so it never disturbs primary_location_id.
 * Revalidates the surfaces whose layout flexes on the flag.
 */
export async function setLocationVisibility(
  hide: boolean,
): Promise<LocationResult> {
  const t = await getTranslations("errors");
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ hide_location_info: hide, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/parts/[id]", "page");
  revalidatePath("/purchase-orders/[id]", "page");
  return { ok: true };
}

/**
 * Point app_settings.primary_location_id at a location, straight from its
 * row on the Locations screen (location config lives here, not on
 * /admin/settings). The primary is where receiving/consumption default to
 * and what the hidden-location forms target — so only active locations
 * qualify. Revalidates the surfaces that read the primary.
 */
export async function setPrimaryLocation(id: string): Promise<LocationResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const supabase = await createClient();
  const { data: loc } = await supabase
    .from("inventory_locations")
    .select("id, is_active")
    .eq("id", id)
    .maybeSingle();
  if (!loc) return { ok: false, error: t("adminLocationNotFound") };
  if (!loc.is_active) {
    return {
      ok: false,
      error: t("adminLocationArchivedPrimary"),
    };
  }

  const { error } = await supabase
    .from("app_settings")
    .update({
      primary_location_id: id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  revalidatePath("/parts/[id]", "page");
  revalidatePath("/purchase-orders/[id]", "page");
  return { ok: true };
}

/**
 * Toggle active. Soft-archive only (controlled vocab) — movements referencing
 * this location keep their reference. The primary shop location can't be
 * archived: consumption/receipt falls back to it and the hidden-location
 * pickers target it, so a different primary must be set first.
 */
export async function setLocationActive(
  id: string,
  isActive: boolean,
): Promise<LocationResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const supabase = await createClient();

  if (!isActive) {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("primary_location_id")
      .eq("id", 1)
      .maybeSingle();
    if (settings?.primary_location_id === id) {
      return {
        ok: false,
        error: t("adminLocationPrimaryArchive"),
      };
    }
  }

  const { error } = await supabase
    .from("inventory_locations")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  return { ok: true };
}
