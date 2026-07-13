"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type HsCodeResult = { ok: true } | { ok: false; error: string };

type ParsedHsCode = {
  code: string;
  description: string;
  tariff_pct: number;
  anti_dumping_pct: number | null;
  notes: string | null;
  is_active: boolean;
};

function parsePctInput(
  raw: string | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; value: number } | { ok: false; error: string } {
  if (!raw || raw.trim() === "") {
    return { ok: false, error: t("adminHsTariffRequired") };
  }
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: t("adminHsTariffNumber") };
  }
  if (n < 0 || n > 1) {
    return {
      ok: false,
      error: t("adminHsTariffRange"),
    };
  }
  return { ok: true, value: n };
}

function parseFormData(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; values: ParsedHsCode } | { ok: false; error: string } {
  const code = nullable(formData.get("code"))?.trim();
  if (!code) return { ok: false, error: t("adminCodeRequired") };

  const description = nullable(formData.get("description"))?.trim();
  if (!description) return { ok: false, error: t("adminHsDescriptionRequired") };

  const tariff = parsePctInput(nullable(formData.get("tariff_pct")), t);
  if (!tariff.ok) return { ok: false, error: tariff.error };

  // Anti-dumping is optional. Form sends "" when not set; treat as null.
  // When provided, accept up to 2.00 (200 %) — anti-dumping regimes can
  // push into the high double-digits, well above the 100 % cap on
  // ordinary tariff.
  const adRaw = nullable(formData.get("anti_dumping_pct"));
  let anti_dumping_pct: number | null = null;
  if (adRaw && adRaw.trim() !== "") {
    const n = Number(adRaw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 2) {
      return {
        ok: false,
        error: t("adminHsAntiDumpingRange"),
      };
    }
    anti_dumping_pct = n;
  }

  return {
    ok: true,
    values: {
      code,
      description,
      tariff_pct: tariff.value,
      anti_dumping_pct,
      notes: nullable(formData.get("notes")),
      is_active: formData.get("is_active") === "on",
    },
  };
}

export async function createHsCode(
  formData: FormData,
): Promise<HsCodeResult> {
  const t = await getTranslations("errors");
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("hs_codes").insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: t("adminHsCodeExists", { code: parsed.values.code }) };
    }
    return { ok: false, error: t("couldNotCreate", { detail: error.message }) };
  }
  revalidatePath("/admin/hs-codes");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateHsCode(
  id: string,
  formData: FormData,
): Promise<HsCodeResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("hs_codes")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: t("adminHsCodeExists", { code: parsed.values.code }) };
    }
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  }
  revalidatePath("/admin/hs-codes");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Soft-archive / restore. HS codes referenced by parts can't be
 * hard-deleted without cascading the tariff snapshot loss. Flipping
 * `is_active` is the toggle — pickers hide archived rows; historical
 * PO lines carry their own snapshotted `tariff_pct` so nothing
 * downstream breaks.
 *
 * Replaces the old one-way `archiveHsCode` action — now that the
 * detail page is harmonized with /admin/colors and
 * /admin/customer-segments, the same setActive shape lets the
 * ArchiveButton component handle both directions.
 */
export async function setHsCodeActive(
  id: string,
  isActive: boolean,
): Promise<HsCodeResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("hs_codes")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }
  revalidatePath("/admin/hs-codes");
  revalidatePath("/admin");
  return { ok: true };
}
