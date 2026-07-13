"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";

export type ManageImageResult = { ok: true } | { ok: false; error: string };

/**
 * Promote one bike attachment to `purpose='hero'` and demote any other hero
 * photos for the same bike to `gallery`. Two rows can never both be hero for
 * the same bike — if it happens by accident, this action heals it.
 */
export async function setBikeHeroImage(
  bikeId: string,
  attachmentId: string,
): Promise<ManageImageResult> {
  const t = await getTranslations("errors");
  if (!bikeId || !attachmentId) {
    return { ok: false, error: t("bikeIdAndAttachmentRequired") };
  }
  const supabase = createServiceClient();

  const { error: demoteErr } = await supabase
    .from("attachments")
    .update({ purpose: "gallery" })
    .eq("entity_type", "bike")
    .eq("entity_id", bikeId)
    .eq("purpose", "hero")
    .neq("id", attachmentId)
    .is("deleted_at", null);
  if (demoteErr) {
    return {
      ok: false,
      error: t("bikeCouldNotDemoteHero", { detail: demoteErr.message }),
    };
  }

  const { error: promoteErr } = await supabase
    .from("attachments")
    .update({ purpose: "hero" })
    .eq("id", attachmentId)
    .is("deleted_at", null);
  if (promoteErr) {
    return {
      ok: false,
      error: t("bikeCouldNotPromoteHero", { detail: promoteErr.message }),
    };
  }

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}

/**
 * Soft-delete a bike attachment. If the deleted photo was the hero, promote
 * the most recently uploaded surviving photo so the bike keeps a header
 * thumbnail. Storage blobs are not deleted yet — same rationale as the parts
 * version (audit trail + brief undo window).
 */
export async function deleteBikeImage(
  bikeId: string,
  attachmentId: string,
): Promise<ManageImageResult> {
  const t = await getTranslations("errors");
  if (!bikeId || !attachmentId) {
    return { ok: false, error: t("bikeIdAndAttachmentRequired") };
  }
  const supabase = createServiceClient();

  const { data: target, error: fetchErr } = await supabase
    .from("attachments")
    .select("id, purpose")
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchErr) {
    return {
      ok: false,
      error: t("bikeCouldNotLoadAttachment", { detail: fetchErr.message }),
    };
  }
  if (!target) {
    return { ok: false, error: t("bikeAttachmentNotFound") };
  }

  const { error: deleteErr } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId);
  if (deleteErr) {
    return { ok: false, error: t("couldNotDelete", { detail: deleteErr.message }) };
  }

  if (target.purpose === "hero") {
    const { data: next, error: nextErr } = await supabase
      .from("attachments")
      .select("id")
      .eq("entity_type", "bike")
      .eq("entity_id", bikeId)
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

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}
