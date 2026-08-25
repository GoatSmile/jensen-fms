"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { hashPassword } from "@/lib/people/password";
import { readPersonId } from "@/lib/auth/read-session";
import { createClient } from "@/lib/supabase/server";

export type PersonResult = { ok: true } | { ok: false; error: string };

const PASSWORD_MIN_LENGTH = 6;

type ParsedPerson = {
  full_name: string;
  email: string | null;
  phone: string | null;
  preferred_language: string | null;
  engaged_from: string | null;
  engaged_until: string | null;
  notify_email: boolean;
  notify_sms: boolean;
  notes: string | null;
  is_active: boolean;
};

function parseFormData(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
):
  | { ok: true; values: ParsedPerson; roleIds: string[] }
  | { ok: false; error: string } {
  const full_name = nullable(formData.get("full_name"))?.trim();
  if (!full_name) return { ok: false, error: t("nameRequired") };

  // NULL = follow the app default (migration 81) — anything we don't
  // recognise means "not chosen", never a silent fallback to Danish.
  const language = nullable(formData.get("preferred_language"));
  return {
    ok: true,
    values: {
      full_name,
      email: nullable(formData.get("email"))?.trim() || null,
      phone: nullable(formData.get("phone"))?.trim() || null,
      preferred_language:
        language === "en" || language === "da" ? language : null,
      engaged_from: nullable(formData.get("engaged_from")) || null,
      engaged_until: nullable(formData.get("engaged_until")) || null,
      notify_email: formData.get("notify_email") === "on",
      notify_sms: formData.get("notify_sms") === "on",
      notes: nullable(formData.get("notes"))?.trim() || null,
      is_active: formData.get("is_active") === "on",
    },
    roleIds: formData
      .getAll("role_ids")
      .map((v) => String(v))
      .filter(Boolean),
  };
}

function revalidate() {
  revalidatePath("/admin/people");
  revalidatePath("/admin");
}

/**
 * Replace the person's role set. Tiny table, so plain delete-then-insert —
 * no diffing. Role membership is config, not history (assignments on
 * WOs/MOs are the historical record, and they FK the person, not the role).
 */
async function syncPersonRoles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  roleIds: string[],
): Promise<string | null> {
  const { error: delError } = await supabase
    .from("person_roles")
    .delete()
    .eq("person_id", personId);
  if (delError) return delError.message;
  if (roleIds.length === 0) return null;
  const { error: insError } = await supabase
    .from("person_roles")
    .insert(roleIds.map((role_id) => ({ person_id: personId, role_id })));
  return insError ? insError.message : null;
}

export async function createPerson(formData: FormData): Promise<PersonResult> {
  const t = await getTranslations("errors");
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .insert({ ...parsed.values, last_actor_id: await readPersonId() })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: t("couldNotCreate", { detail: error?.message ?? "?" }),
    };
  }

  const syncError = await syncPersonRoles(supabase, data.id, parsed.roleIds);
  if (syncError) {
    return { ok: false, error: t("couldNotSave", { detail: syncError }) };
  }

  revalidate();
  return { ok: true };
}

export async function updatePerson(
  id: string,
  formData: FormData,
): Promise<PersonResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ ...parsed.values, last_actor_id: await readPersonId() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  }

  const syncError = await syncPersonRoles(supabase, id, parsed.roleIds);
  if (syncError) {
    return { ok: false, error: t("couldNotSave", { detail: syncError }) };
  }

  revalidate();
  return { ok: true };
}

/**
 * Soft-archive (is_active convention). Assignments and history keep their
 * FK; the person just drops out of pickers.
 */
export async function setPersonActive(
  id: string,
  isActive: boolean,
): Promise<PersonResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const supabase = await createClient();
  if (!isActive) {
    const { data: person } = await supabase
      .from("people")
      .select("is_system")
      .eq("id", id)
      .maybeSingle();
    if (person?.is_system) {
      return { ok: false, error: t("adminPersonArchiveSystem") };
    }
  }
  const { error } = await supabase
    .from("people")
    .update({ is_active: isActive, last_actor_id: await readPersonId() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidate();
  return { ok: true };
}

/**
 * Set/rotate this person's login password — write-only (the UI never shows a
 * stored value, only set/missing; same status pattern as env secrets).
 *
 * The shared Admin account is refused: it authenticates against
 * SITE_PASSWORD, and a hash here would be dead weight that looks live.
 */
export async function setPersonPassword(
  id: string,
  formData: FormData,
): Promise<PersonResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const password = nullable(formData.get("password"));
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: t("adminPersonPasswordTooShort") };
  }

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("is_system")
    .eq("id", id)
    .maybeSingle();
  if (person?.is_system) {
    return { ok: false, error: t("adminPersonPasswordSystem") };
  }

  const password_hash = await hashPassword(password);
  const { error } = await supabase
    .from("people")
    .update({ password_hash, last_actor_id: await readPersonId() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidate();
  return { ok: true };
}
