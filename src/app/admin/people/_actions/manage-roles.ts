"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { isCapability } from "@/lib/people/capabilities";
import { isNotificationEvent } from "@/lib/people/notifications";
import { hashPassword } from "@/lib/people/password";
import { createClient } from "@/lib/supabase/server";

export type RoleResult = { ok: true } | { ok: false; error: string };

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const PASSWORD_MIN_LENGTH = 6;

type ParsedRole = {
  name_en: string;
  name_da: string | null;
  home_path: string;
  sort_order: number;
  is_active: boolean;
};

function parseFormData(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
):
  | {
      ok: true;
      values: ParsedRole;
      capabilities: string[];
      events: string[];
    }
  | { ok: false; error: string } {
  const name_en = nullable(formData.get("name_en"))?.trim();
  if (!name_en) return { ok: false, error: t("nameRequired") };

  const home_path = nullable(formData.get("home_path"))?.trim() || "/";
  if (!home_path.startsWith("/") || home_path.startsWith("//")) {
    return { ok: false, error: t("adminRoleHomePathInvalid") };
  }

  const sortOrderRaw = nullable(formData.get("sort_order"));
  let sort_order = 0;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isFinite(n)) return { ok: false, error: t("sortOrderNumber") };
    sort_order = Math.trunc(n);
  }

  // Unknown keys are dropped silently, not rejected: the registries are the
  // source of truth, so a stale checkbox can't grant anything code doesn't
  // enforce.
  const capabilities = formData
    .getAll("capabilities")
    .map((v) => String(v))
    .filter(isCapability);
  const events = formData
    .getAll("events")
    .map((v) => String(v))
    .filter(isNotificationEvent);

  return {
    ok: true,
    values: {
      name_en,
      name_da: nullable(formData.get("name_da"))?.trim() || null,
      home_path,
      sort_order,
      is_active: formData.get("is_active") === "on",
    },
    capabilities,
    events,
  };
}

function revalidate() {
  revalidatePath("/admin/people");
  revalidatePath("/admin");
}

async function syncRoleGrants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roleId: string,
  capabilities: string[],
  events: string[],
): Promise<string | null> {
  const { error: capDelError } = await supabase
    .from("role_capabilities")
    .delete()
    .eq("role_id", roleId);
  if (capDelError) return capDelError.message;
  if (capabilities.length > 0) {
    const { error } = await supabase
      .from("role_capabilities")
      .insert(capabilities.map((capability) => ({ role_id: roleId, capability })));
    if (error) return error.message;
  }

  const { error: evtDelError } = await supabase
    .from("role_notifications")
    .delete()
    .eq("role_id", roleId);
  if (evtDelError) return evtDelError.message;
  if (events.length > 0) {
    const { error } = await supabase
      .from("role_notifications")
      .insert(events.map((event_key) => ({ role_id: roleId, event_key })));
    if (error) return error.message;
  }
  return null;
}

export async function createRole(formData: FormData): Promise<RoleResult> {
  const t = await getTranslations("errors");

  // Key is set once at create and immutable after — code references roles
  // by key (seeds, login fallback), so renaming would silently unhook them.
  const key = nullable(formData.get("key"))?.trim().toLowerCase();
  if (!key || !KEY_PATTERN.test(key)) {
    return { ok: false, error: t("adminRoleKeyInvalid") };
  }

  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .insert({ key, ...parsed.values })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: t("adminRoleKeyExists") };
    }
    return {
      ok: false,
      error: t("couldNotCreate", { detail: error?.message ?? "?" }),
    };
  }

  const syncError = await syncRoleGrants(
    supabase,
    data.id,
    parsed.capabilities,
    parsed.events,
  );
  if (syncError) {
    return { ok: false, error: t("couldNotSave", { detail: syncError }) };
  }

  revalidate();
  return { ok: true };
}

export async function updateRole(
  id: string,
  formData: FormData,
): Promise<RoleResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };
  const parsed = parseFormData(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .update(parsed.values)
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  }

  const syncError = await syncRoleGrants(
    supabase,
    id,
    parsed.capabilities,
    parsed.events,
  );
  if (syncError) {
    return { ok: false, error: t("couldNotSave", { detail: syncError }) };
  }

  revalidate();
  return { ok: true };
}

/**
 * Soft-archive. An archived role keeps its grants and members but (from P2)
 * is skipped by login resolution and drops out of the person form's
 * checkboxes for new assignments.
 */
export async function setRoleActive(
  id: string,
  isActive: boolean,
): Promise<RoleResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidate();
  return { ok: true };
}

/**
 * Set/rotate the role's login password — write-only (the UI never shows a
 * stored value, only set/missing; same status pattern as env secrets).
 */
export async function setRolePassword(
  id: string,
  formData: FormData,
): Promise<RoleResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("missingId") };

  const password = nullable(formData.get("password"));
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: t("adminRolePasswordTooShort") };
  }

  const supabase = await createClient();
  const password_hash = await hashPassword(password);
  const { error } = await supabase
    .from("roles")
    .update({ password_hash })
    .eq("id", id);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidate();
  return { ok: true };
}
