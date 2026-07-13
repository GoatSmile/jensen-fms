"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SupplierResult = { ok: true } | { ok: false; error: string };

type ParsedSupplier = {
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  zip_code: string | null;
  town: string | null;
  province: string | null;
  country_code: string | null;
  phone: string | null;
  email_primary: string | null;
  email_secondary: string | null;
  website: string | null;
  default_currency: string | null;
  payment_terms_days: number | null;
  import_duty_prepaid_default: boolean;
  notes: string | null;
  is_active: boolean;
};

function parsePaymentTerms(
  raw: string | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return {
      ok: false,
      error: t("adminSupplierPaymentTerms"),
    };
  }
  return { ok: true, value: n };
}

function parseFormData(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; values: ParsedSupplier } | { ok: false; error: string } {
  const name = nullable(formData.get("name"))?.trim();
  if (!name) return { ok: false, error: t("adminSupplierNameRequired") };

  const pt = parsePaymentTerms(nullable(formData.get("payment_terms_days")), t);
  if (!pt.ok) return { ok: false, error: pt.error };

  const rawCountry = nullable(formData.get("country_code"));
  const country_code = rawCountry ? rawCountry.toUpperCase() : null;

  const rawCurrency = nullable(formData.get("default_currency"));
  const default_currency = rawCurrency ? rawCurrency.toUpperCase() : null;

  return {
    ok: true,
    values: {
      name,
      address_line1: nullable(formData.get("address_line1")),
      address_line2: nullable(formData.get("address_line2")),
      zip_code: nullable(formData.get("zip_code")),
      town: nullable(formData.get("town")),
      province: nullable(formData.get("province")),
      country_code,
      phone: nullable(formData.get("phone")),
      email_primary: nullable(formData.get("email_primary")),
      email_secondary: nullable(formData.get("email_secondary")),
      website: nullable(formData.get("website")),
      default_currency,
      payment_terms_days: pt.value,
      import_duty_prepaid_default:
        formData.get("import_duty_prepaid_default") === "on",
      notes: nullable(formData.get("notes")),
      is_active: formData.get("is_active") === "on",
    },
  };
}

export async function createSupplier(
  formData: FormData,
): Promise<SupplierResult> {
  const t = await getTranslations("errors");
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: t("adminSupplierNameExists", { name: parsed.values.name }),
      };
    }
    return { ok: false, error: t("couldNotCreate", { detail: error.message }) };
  }
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateSupplier(
  id: string,
  formData: FormData,
): Promise<SupplierResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingSupplierId") };
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: t("adminSupplierNameExists", { name: parsed.values.name }),
      };
    }
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  }
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Toggle active. Soft-archive only — suppliers referenced by parts /
 * POs keep their links; pickers hide archived rows. Mirrors the
 * controlled-vocab archive convention used by colors / hs-codes /
 * customer-segments. Does not touch deleted_at (archived ≠ deleted).
 */
export async function setSupplierActive(
  id: string,
  isActive: boolean,
): Promise<SupplierResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingSupplierId") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin");
  return { ok: true };
}
