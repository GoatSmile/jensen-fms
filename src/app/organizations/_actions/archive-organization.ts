"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ArchiveOrganizationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Soft-deletes an organization by setting `deleted_at = NOW()` and
 * `is_active = false`. If a reason is supplied, it's appended to `notes`
 * for the audit trail (mirrors the MO cancel pattern). No bikes are
 * touched — `owner_organization_id` stays pointed at the archived row
 * so historical assignments remain visible.
 */
export async function archiveOrganization(
  organizationId: string,
  reason: string | null,
): Promise<ArchiveOrganizationResult> {
  if (!organizationId) return { ok: false, error: "Missing customer id." };

  const supabase = await createClient();

  // Read existing notes so we can append the archive reason rather than
  // replacing whatever is there.
  const existing = await supabase
    .from("organizations")
    .select("notes")
    .eq("id", organizationId)
    .maybeSingle();
  if (existing.error) {
    return {
      ok: false,
      error: `Could not load customer: ${existing.error.message}`,
    };
  }
  if (!existing.data) return { ok: false, error: "Customer not found." };

  const cleanReason = nullable(reason);
  const stamp = new Date().toISOString().slice(0, 10);
  const newNotes = cleanReason
    ? [existing.data.notes, `[Archived ${stamp}] ${cleanReason}`]
        .filter(Boolean)
        .join("\n\n")
    : existing.data.notes;

  const { error } = await supabase
    .from("organizations")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      notes: newNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);
  if (error) return { ok: false, error: `Could not archive: ${error.message}` };

  revalidatePath("/organizations");
  revalidatePath(`/organizations/${organizationId}`);
  redirect("/organizations");
}
