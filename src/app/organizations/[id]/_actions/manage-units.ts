"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";

export type UnitResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

type ParsedUnit = {
  name: string;
  code: string | null;
  address: string | null;
  notes: string | null;
};

function parseUnit(
  formData: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
): ParsedUnit | { error: string; field?: string } {
  const name = nullable(formData.get("name"));
  if (!name) {
    return { error: t("nameRequired"), field: "name" };
  }
  return {
    name,
    code: nullable(formData.get("code")),
    address: nullable(formData.get("address")),
    notes: nullable(formData.get("notes")),
  };
}

export async function createUnit(
  organizationId: string,
  formData: FormData,
): Promise<UnitResult> {
  const t = await getTranslations("errors");
  if (!organizationId) {
    return { ok: false, error: t("missingCustomerId") };
  }
  const parsed = parseUnit(formData, t);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, field: parsed.field };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organization_units").insert({
    organization_id: organizationId,
    ...parsed,
  });
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidatePath(`/organizations/${organizationId}`);
  return { ok: true };
}

export async function updateUnit(
  unitId: string,
  formData: FormData,
): Promise<UnitResult> {
  const t = await getTranslations("errors");
  if (!unitId) {
    return { ok: false, error: t("orgMissingUnitId") };
  }
  const parsed = parseUnit(formData, t);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, field: parsed.field };
  }

  const supabase = await createClient();
  const existing = await supabase
    .from("organization_units")
    .select("organization_id")
    .eq("id", unitId)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, error: t("couldNotLoad", { detail: existing.error.message }) };
  }
  if (!existing.data) {
    return { ok: false, error: t("unitNotFound") };
  }

  const { error } = await supabase
    .from("organization_units")
    .update(parsed)
    .eq("id", unitId);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidatePath(`/organizations/${existing.data.organization_id}`);
  return { ok: true };
}

/**
 * Soft-delete a sub-unit. Refuses if any non-deleted bike still points to
 * it via `owner_unit_id` — those references would silently turn into broken
 * pointers and the bike list would show "unknown sub-unit". The user has to
 * reassign or unassign the bikes first.
 */
export async function archiveUnit(unitId: string): Promise<UnitResult> {
  const t = await getTranslations("errors");
  if (!unitId) {
    return { ok: false, error: t("orgMissingUnitId") };
  }
  const supabase = await createClient();

  const existing = await supabase
    .from("organization_units")
    .select("organization_id")
    .eq("id", unitId)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, error: t("couldNotLoad", { detail: existing.error.message }) };
  }
  if (!existing.data) {
    return { ok: false, error: t("unitNotFound") };
  }

  const { count, error: countError } = await supabase
    .from("bikes")
    .select("id", { count: "exact", head: true })
    .eq("owner_unit_id", unitId)
    .is("deleted_at", null);
  if (countError) {
    return {
      ok: false,
      error: t("unitCouldNotCheckBikes", { detail: countError.message }),
    };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        count === 1
          ? t("unitReassignBikeSingular")
          : t("unitReassignBikesPlural", { count: count ?? 0 }),
    };
  }

  const { error } = await supabase
    .from("organization_units")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", unitId);
  if (error) {
    return { ok: false, error: t("couldNotArchive", { detail: error.message }) };
  }

  revalidatePath(`/organizations/${existing.data.organization_id}`);
  return { ok: true };
}
