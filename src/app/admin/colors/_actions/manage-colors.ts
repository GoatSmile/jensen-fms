"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { normaliseRalCode, ralToHex } from "@/lib/colors/ral";
import { nullableString as nullable, slugify } from "@/lib/forms";
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


function parseFormData(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; values: ParsedColor } | { ok: false; error: string } {
  const name_en = nullable(formData.get("name_en"))?.trim();
  if (!name_en) return { ok: false, error: t("englishNameRequired") };

  const name_da = (nullable(formData.get("name_da"))?.trim()) || name_en;

  // Hex: optional, accept "#rrggbb" or "rrggbb".
  let hex = nullable(formData.get("hex"))?.trim() ?? null;
  if (hex) {
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return {
        ok: false,
        error: t("adminColorHexFormat"),
      };
    }
    hex = hex.toLowerCase();
  }

  const ralRaw = nullable(formData.get("ral_code"))?.trim() ?? null;
  // An unknown code is refused rather than stored as free text: "RAL 5013" with
  // the code 2150 reached production and went onto two orders precisely because
  // nothing checked. Stored in the bare 4-digit form so the column can be
  // joined on — "RAL 1006" and "1006" must not be two different strings.
  let ral_code: string | null = null;
  if (ralRaw && ralRaw !== "") {
    ral_code = normaliseRalCode(ralRaw);
    if (!ral_code) {
      return { ok: false, error: t("adminColorRalUnknown", { code: ralRaw }) };
    }
  }

  // Server backstop: if no explicit hex but the RAL code resolves to a known
  // sRGB approximation, store it so the swatch shows a real colour everywhere —
  // even on surfaces that don't carry ral_code through to the component.
  if (!hex) {
    const fromRal = ralToHex(ral_code);
    if (fromRal) hex = fromRal.toLowerCase();
  }

  const coating = nullable(formData.get("coating"))?.trim() ?? null;

  const sortOrderRaw = nullable(formData.get("sort_order"));
  let sort_order = 0;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: t("sortOrderNumber") };
    }
    sort_order = Math.trunc(n);
  }

  // Slug pulled from explicit field, else derived from name_en.
  const explicitSlug = nullable(formData.get("slug"))?.trim();
  const slug = slugify(explicitSlug || name_en);
  if (!slug) {
    return { ok: false, error: t("adminSlugFromName") };
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
  const t = await getTranslations("errors");
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("colors").insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("slug")
          ? t("adminColorSlugExists")
          : t("adminColorNameExists"),
      };
    }
    return { ok: false, error: t("couldNotCreate", { detail: error.message }) };
  }
  revalidatePath("/admin/colors");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateColor(
  id: string,
  formData: FormData,
): Promise<ColorResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("colors")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: t("adminColorSlugExists") };
    }
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
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
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("colors")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }
  revalidatePath("/admin/colors");
  revalidatePath("/admin");
  return { ok: true };
}
