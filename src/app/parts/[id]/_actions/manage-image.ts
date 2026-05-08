"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";

export type ManageImageResult = { ok: true } | { ok: false; error: string };

/**
 * Promote one attachment to `purpose='hero'` and demote any other hero photos
 * for the same part to `gallery`. Two rows can never both be hero for the same
 * part — if it happens by accident, this action heals it.
 */
export async function setHeroImage(
  partId: string,
  attachmentId: string,
): Promise<ManageImageResult> {
  if (!partId || !attachmentId) {
    return { ok: false, error: "partId and attachmentId are required." };
  }
  const supabase = createServiceClient();

  // Demote current heroes (could be 0, normally 1).
  const { error: demoteErr } = await supabase
    .from("attachments")
    .update({ purpose: "gallery" })
    .eq("entity_type", "part")
    .eq("entity_id", partId)
    .eq("purpose", "hero")
    .neq("id", attachmentId)
    .is("deleted_at", null);
  if (demoteErr) {
    return { ok: false, error: `Could not demote prior hero: ${demoteErr.message}` };
  }

  const { error: promoteErr } = await supabase
    .from("attachments")
    .update({ purpose: "hero" })
    .eq("id", attachmentId)
    .is("deleted_at", null);
  if (promoteErr) {
    return { ok: false, error: `Could not promote hero: ${promoteErr.message}` };
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  return { ok: true };
}

/**
 * Soft-delete an attachment (sets `deleted_at`). The storage object remains
 * for now; a future periodic sweeper can hard-delete soft-deleted rows older
 * than N days along with their storage objects. Keeping the blob preserves
 * the audit trail and gives a brief undo window.
 *
 * If the deleted photo was the hero, the most recently uploaded surviving
 * photo is promoted so the part keeps a header thumbnail. If there are none
 * left, the part falls back to the empty placeholder.
 */
export async function deletePartImage(
  partId: string,
  attachmentId: string,
): Promise<ManageImageResult> {
  if (!partId || !attachmentId) {
    return { ok: false, error: "partId and attachmentId are required." };
  }
  const supabase = createServiceClient();

  const { data: target, error: fetchErr } = await supabase
    .from("attachments")
    .select("id, purpose")
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchErr) {
    return { ok: false, error: `Could not load attachment: ${fetchErr.message}` };
  }
  if (!target) {
    return { ok: false, error: "Attachment not found or already deleted." };
  }

  const { error: deleteErr } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId);
  if (deleteErr) {
    return { ok: false, error: `Could not delete: ${deleteErr.message}` };
  }

  // If we removed the hero, promote the next-most-recent gallery photo so the
  // part keeps a header thumbnail. No-op if no other photos remain.
  if (target.purpose === "hero") {
    const { data: next, error: nextErr } = await supabase
      .from("attachments")
      .select("id")
      .eq("entity_type", "part")
      .eq("entity_id", partId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!nextErr && next) {
      await supabase
        .from("attachments")
        .update({ purpose: "hero" })
        .eq("id", next.id);
    }
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  return { ok: true };
}
