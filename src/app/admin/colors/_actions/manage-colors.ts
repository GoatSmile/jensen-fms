"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ColorResult = { ok: true } | { ok: false; error: string };

type ParsedColor = {
  name_en: string;
  name_da: string;
  slug: string;
  hex: string | null;
  ral_code: string | null;
  coating: string | null;
  sort_order: number;
  is_active: boolean;
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
): { ok: true; values: ParsedColor } | { ok: false; error: string } {
  const name_en = nullable(formData.get("name_en"))?.trim();
  if (!name_en) return { ok: false, error: "English name is required." };

  const name_da = (nullable(formData.get("name_da"))?.trim()) || name_en;

  // Hex: optional, accept "#rrggbb" or "rrggbb".
  let hex = nullable(formData.get("hex"))?.trim() ?? null;
  if (hex) {
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return {
        ok: false,
        error: "Hex must be 6 hex digits (e.g. #1e4a7a) or blank.",
      };
    }
    hex = hex.toLowerCase();
  }

  const ralRaw = nullable(formData.get("ral_code"))?.trim() ?? null;
  const ral_code = ralRaw && ralRaw !== "" ? ralRaw : null;

  const coating = nullable(formData.get("coating"))?.trim() ?? null;

  const sortOrderRaw = nullable(formData.get("sort_order"));
  let sort_order = 0;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Sort order must be a number." };
    }
    sort_order = Math.trunc(n);
  }

  // Slug pulled from explicit field, else derived from name_en.
  const explicitSlug = nullable(formData.get("slug"))?.trim();
  const slug = slugify(explicitSlug || name_en);
  if (!slug) {
    return { ok: false, error: "Could not generate a slug from the name." };
  }

  return {
    ok: true,
    values: {
      name_en,
      name_da,
      slug,
      hex,
      ral_code,
      coating,
      sort_order,
      is_active: formData.get("is_active") === "on",
    },
  };
}

export async function createColor(formData: FormData): Promise<ColorResult> {
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("colors").insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: `A colour with that ${error.message.includes("slug") ? "slug" : "name"} already exists.`,
      };
    }
    return { ok: false, error: `Could not create: ${error.message}` };
  }
  revalidatePath("/admin/colors");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateColor(
  id: string,
  formData: FormData,
): Promise<ColorResult> {
  if (!id) return { ok: false, error: "Missing id." };
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("colors")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A colour with that slug already exists." };
    }
    return { ok: false, error: `Could not update: ${error.message}` };
  }
  revalidatePath("/admin/colors");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Toggle active. Soft-archive only — bikes/MOs referencing this colour keep
 * their reference (it's a controlled vocab, not deletable mid-flight).
 */
export async function setColorActive(
  id: string,
  isActive: boolean,
): Promise<ColorResult> {
  if (!id) return { ok: false, error: "Missing id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("colors")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: `Could not save: ${error.message}` };
  }
  revalidatePath("/admin/colors");
  revalidatePath("/admin");
  return { ok: true };
}
