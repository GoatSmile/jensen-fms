"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

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
): ParsedUnit | { error: string; field?: string } {
  const name = nullable(formData.get("name"));
  if (!name) {
    return { error: "Name is required.", field: "name" };
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
  if (!organizationId) {
    return { ok: false, error: "Missing customer id." };
  }
  const parsed = parseUnit(formData);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, field: parsed.field };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organization_units").insert({
    organization_id: organizationId,
    ...parsed,
  });
  if (error) {
    return { ok: false, error: `Could not save: ${error.message}` };
  }

  revalidatePath(`/organizations/${organizationId}`);
  return { ok: true };
}

export async function updateUnit(
  unitId: string,
  formData: FormData,
): Promise<UnitResult> {
  if (!unitId) {
    return { ok: false, error: "Missing sub-unit id." };
  }
  const parsed = parseUnit(formData);
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
    return { ok: false, error: `Could not load: ${existing.error.message}` };
  }
  if (!existing.data) {
    return { ok: false, error: "Sub-unit not found." };
  }

  const { error } = await supabase
    .from("organization_units")
    .update(parsed)
    .eq("id", unitId);
  if (error) {
    return { ok: false, error: `Could not save: ${error.message}` };
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
  if (!unitId) {
    return { ok: false, error: "Missing sub-unit id." };
  }
  const supabase = await createClient();

  const existing = await supabase
    .from("organization_units")
    .select("organization_id")
    .eq("id", unitId)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, error: `Could not load: ${existing.error.message}` };
  }
  if (!existing.data) {
    return { ok: false, error: "Sub-unit not found." };
  }

  const { count, error: countError } = await supabase
    .from("bikes")
    .select("id", { count: "exact", head: true })
    .eq("owner_unit_id", unitId)
    .is("deleted_at", null);
  if (countError) {
    return {
      ok: false,
      error: `Could not check assigned bikes: ${countError.message}`,
    };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        count === 1
          ? "Reassign the bike pointing at this sub-unit before archiving."
          : `Reassign the ${count} bikes pointing at this sub-unit before archiving.`,
    };
  }

  const { error } = await supabase
    .from("organization_units")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", unitId);
  if (error) {
    return { ok: false, error: `Could not archive: ${error.message}` };
  }

  revalidatePath(`/organizations/${existing.data.organization_id}`);
  return { ok: true };
}
