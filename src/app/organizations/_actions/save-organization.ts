"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveOrganizationResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string; field?: string };

type ParsedOrganization = {
  legal_name: string;
  display_name_en: string | null;
  display_name_da: string | null;
  customer_segment_id: string;
  preferred_language: string;
  cvr_number: string | null;
  ean_number: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  zip_code: string | null;
  city: string | null;
  state_province: string | null;
  country_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  billing_currency: string | null;
  payment_terms_days: number | null;
  default_vat_code: string | null;
  notes: string | null;
};

function parsePaymentTerms(
  raw: string | null,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return {
      ok: false,
      error: "Payment terms must be a non-negative whole number of days.",
    };
  }
  return { ok: true, value: n };
}

function parseOrganization(
  formData: FormData,
): ParsedOrganization | { error: string; field?: string } {
  const legal_name = nullable(formData.get("legal_name"));
  const customer_segment_id = nullable(formData.get("customer_segment_id"));

  if (!legal_name)
    return { error: "Legal name is required.", field: "legal_name" };
  if (!customer_segment_id)
    return {
      error: "Customer segment is required.",
      field: "customer_segment_id",
    };

  const pt = parsePaymentTerms(nullable(formData.get("payment_terms_days")));
  if (!pt.ok) return { error: pt.error, field: "payment_terms_days" };

  const rawCountry = nullable(formData.get("country_code"));
  const country_code = rawCountry ? rawCountry.toUpperCase() : null;

  const rawLang = nullable(formData.get("preferred_language"));
  // The DB column is NOT NULL; default to 'da' if the form ever sent nothing.
  const preferred_language = rawLang ?? "da";

  return {
    legal_name,
    display_name_en: nullable(formData.get("display_name_en")),
    display_name_da: nullable(formData.get("display_name_da")),
    customer_segment_id,
    preferred_language,
    cvr_number: nullable(formData.get("cvr_number")),
    ean_number: nullable(formData.get("ean_number")),
    vat_number: nullable(formData.get("vat_number")),
    address_line1: nullable(formData.get("address_line1")),
    address_line2: nullable(formData.get("address_line2")),
    zip_code: nullable(formData.get("zip_code")),
    city: nullable(formData.get("city")),
    state_province: nullable(formData.get("state_province")),
    country_code,
    phone: nullable(formData.get("phone")),
    email: nullable(formData.get("email")),
    website: nullable(formData.get("website")),
    billing_currency: nullable(formData.get("billing_currency")),
    payment_terms_days: pt.value,
    default_vat_code: nullable(formData.get("default_vat_code")),
    notes: nullable(formData.get("notes")),
  };
}

export async function createOrganization(
  formData: FormData,
): Promise<SaveOrganizationResult> {
  const parsed = parseOrganization(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      ...parsed,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: `Could not create customer: ${error?.message ?? "unknown error"}`,
    };
  }
  revalidatePath("/organizations");
  redirect(`/organizations/${data.id}`);
}

export async function updateOrganization(
  organizationId: string,
  formData: FormData,
): Promise<SaveOrganizationResult> {
  if (!organizationId) return { ok: false, error: "Missing customer id." };
  const parsed = parseOrganization(formData);
  if ("error" in parsed)
    return { ok: false, error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      ...parsed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  revalidatePath("/organizations");
  revalidatePath(`/organizations/${organizationId}`);
  redirect(`/organizations/${organizationId}`);
}
