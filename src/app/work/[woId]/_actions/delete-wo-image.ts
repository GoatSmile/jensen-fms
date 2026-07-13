"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";

export type DeleteWOImageResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Soft-delete an attachment from a work order. Sets `deleted_at`; doesn't
 * remove the bucket object (we keep storage cheap and recoverable). The
 * UI hides anything with `deleted_at IS NOT NULL`.
 *
 * Scoped to entity_type='work_order' so a stale id can't accidentally
 * tombstone a bike photo or a customer-report attachment.
 */
export async function deleteWorkOrderImage(
  attachmentId: string,
  woId: string,
): Promise<DeleteWOImageResult> {
  const t = await getTranslations("errors");
  if (!attachmentId) return { ok: false, error: t("woMissingAttachmentId") };
  if (!woId) return { ok: false, error: t("missingWorkOrderId") };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId)
    .eq("entity_type", "work_order")
    .eq("entity_id", woId);
  if (error) {
    return {
      ok: false,
      error: t("woCouldNotRemovePhoto", { detail: error.message }),
    };
  }

  revalidatePath(`/work/${woId}`);
  revalidatePath(`/maintenance/work-orders/${woId}`);
  return { ok: true };
}
