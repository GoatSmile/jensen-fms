"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";

export type ContactResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

type ParsedContact = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  preferred_language: string | null;
  is_primary: boolean;
  notes: string | null;
};

function parseContact(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
): ParsedContact | { error: string; field?: string } {
  const first_name = nullable(formData.get("first_name"));
  const last_name = nullable(formData.get("last_name"));
  const email = nullable(formData.get("email"));
  const phone = nullable(formData.get("phone"));
  const role = nullable(formData.get("role"));

  // A contact row that has nothing identifying it isn't useful. Require at
  // least one of name or email so the table doesn't accumulate ghost rows.
  if (!first_name && !last_name && !email) {
    return {
      error: t("contactAddNameOrEmail"),
      field: "first_name",
    };
  }

  const rawLang = nullable(formData.get("preferred_language"));
  // Constrain to 'da' | 'en'; other values are coerced to null so the
  // DB column stays clean (it's a CHAR(2) with no enum constraint).
  const preferred_language =
    rawLang === "da" || rawLang === "en" ? rawLang : null;

  const isPrimaryRaw = formData.get("is_primary");
  const is_primary =
    isPrimaryRaw === "on" ||
    isPrimaryRaw === "true" ||
    isPrimaryRaw === "1";

  return {
    first_name,
    last_name,
    email,
    phone,
    role,
    preferred_language,
    is_primary,
    notes: nullable(formData.get("notes")),
  };
}

/**
 * Demote any other primary contact on the same org. Called before insert or
 * update when the incoming row is marked primary, so we maintain the
 * one-primary-at-a-time invariant.
 */
async function demoteOtherPrimaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  exceptContactId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let q = supabase
    .from("contacts")
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .is("deleted_at", null);
  if (exceptContactId) q = q.neq("id", exceptContactId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createContact(
  organizationId: string,
  formData: FormData,
): Promise<ContactResult> {
  const t = await getTranslations("errors");
  if (!organizationId) {
    return { ok: false, error: t("missingCustomerId") };
  }
  const parsed = parseContact(formData, t);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, field: parsed.field };
  }

  const supabase = await createClient();

  if (parsed.is_primary) {
    const r = await demoteOtherPrimaries(supabase, organizationId, null);
    if (!r.ok) {
      return { ok: false, error: t("couldNotSave", { detail: r.error }) };
    }
  }

  const { error } = await supabase.from("contacts").insert({
    organization_id: organizationId,
    ...parsed,
  });
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidatePath(`/organizations/${organizationId}`);
  return { ok: true };
}

export async function updateContact(
  contactId: string,
  formData: FormData,
): Promise<ContactResult> {
  const t = await getTranslations("errors");
  if (!contactId) {
    return { ok: false, error: t("orgMissingContactId") };
  }
  const parsed = parseContact(formData, t);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, field: parsed.field };
  }

  const supabase = await createClient();

  // We need the organization id to scope the primary-demotion and to
  // revalidate the right detail page.
  const existing = await supabase
    .from("contacts")
    .select("organization_id")
    .eq("id", contactId)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, error: t("couldNotLoad", { detail: existing.error.message }) };
  }
  if (!existing.data) {
    return { ok: false, error: t("contactNotFound") };
  }
  const organizationId = existing.data.organization_id;

  if (parsed.is_primary) {
    const r = await demoteOtherPrimaries(supabase, organizationId, contactId);
    if (!r.ok) {
      return { ok: false, error: t("couldNotSave", { detail: r.error }) };
    }
  }

  const { error } = await supabase
    .from("contacts")
    .update({
      ...parsed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidatePath(`/organizations/${organizationId}`);
  return { ok: true };
}

export async function archiveContact(
  contactId: string,
): Promise<ContactResult> {
  const t = await getTranslations("errors");
  if (!contactId) {
    return { ok: false, error: t("orgMissingContactId") };
  }
  const supabase = await createClient();

  const existing = await supabase
    .from("contacts")
    .select("organization_id")
    .eq("id", contactId)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, error: t("couldNotLoad", { detail: existing.error.message }) };
  }
  if (!existing.data) {
    return { ok: false, error: t("contactNotFound") };
  }

  const { error } = await supabase
    .from("contacts")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);
  if (error) {
    return { ok: false, error: t("couldNotArchive", { detail: error.message }) };
  }

  revalidatePath(`/organizations/${existing.data.organization_id}`);
  return { ok: true };
}
