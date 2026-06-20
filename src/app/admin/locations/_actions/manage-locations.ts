"use server";

import { revalidatePath } from "next/cache";

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
): { ok: true; values: ParsedLocation } | { ok: false; error: string } {
  const code = nullable(formData.get("code"))?.trim();
  if (!code) return { ok: false, error: "Code is required." };

  const name_en = nullable(formData.get("name_en"))?.trim();
  if (!name_en) return { ok: false, error: "English name is required." };

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
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_locations")
    .insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: `A location with code "${parsed.values.code}" already exists.`,
      };
    }
    return { ok: false, error: `Could not create: ${error.message}` };
  }
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateLocation(
  id: string,
  formData: FormData,
): Promise<LocationResult> {
  if (!id) return { ok: false, error: "Missing id." };
  const parsed = parseFormData(formData);
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
        error: `A location with code "${parsed.values.code}" already exists.`,
      };
    }
    return { ok: false, error: `Could not update: ${error.message}` };
  }
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
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
  if (!id) return { ok: false, error: "Missing id." };

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
        error:
          "This is the primary shop location. Set a different primary in Settings before archiving it.",
      };
    }
  }

  const { error } = await supabase
    .from("inventory_locations")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return { ok: false, error: `Could not save: ${error.message}` };
  }
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  return { ok: true };
}
