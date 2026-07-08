"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type FamilyResult = { ok: true } | { ok: false; error: string };

type ParsedFamily = {
  name: string;
  sort_order: number;
  is_active: boolean;
};

function parseFormData(
  formData: FormData,
): { ok: true; values: ParsedFamily } | { ok: false; error: string } {
  const name = nullable(formData.get("name"))?.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const sortOrderRaw = nullable(formData.get("sort_order"));
  let sort_order = 0;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Sort order must be a number." };
    }
    sort_order = Math.trunc(n);
  }

  return {
    ok: true,
    values: { name, sort_order, is_active: formData.get("is_active") === "on" },
  };
}

export async function createFamily(formData: FormData): Promise<FamilyResult> {
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("bike_families").insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A family with that name already exists." };
    }
    return { ok: false, error: `Could not create: ${error.message}` };
  }
  revalidatePath("/admin/families");
  revalidatePath("/admin");
  revalidatePath("/bike-templates");
  return { ok: true };
}

export async function updateFamily(
  id: string,
  formData: FormData,
): Promise<FamilyResult> {
  if (!id) return { ok: false, error: "Missing id." };
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_families")
    .update(parsed.values)
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A family with that name already exists." };
    }
    return { ok: false, error: `Could not update: ${error.message}` };
  }
  revalidatePath("/admin/families");
  revalidatePath("/admin");
  revalidatePath("/bike-templates");
  return { ok: true };
}

/**
 * Toggle active. Soft-archive only — templates keep their family_id; an
 * archived family just drops out of the template form's picker. Same
 * controlled-vocab convention as colours/categories.
 */
export async function setFamilyActive(
  id: string,
  isActive: boolean,
): Promise<FamilyResult> {
  if (!id) return { ok: false, error: "Missing id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_families")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  revalidatePath("/admin/families");
  revalidatePath("/admin");
  revalidatePath("/bike-templates");
  return { ok: true };
}
