"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "bike-images";

export type UploadWOImageResult =
  | { ok: true; attachmentId: string }
  | { ok: false; error: string };

/**
 * Attach a photo to a work order. Mirrors the bike photo upload — same
 * bucket, same client-resized WebP input, same row-then-file ordering so
 * a partial failure can't leave a bucket orphan.
 *
 * entity_type='work_order' on the attachments row keeps these photos
 * scoped to the workshop trail without polluting the bike's gallery
 * (which is reserved for hero / lifecycle photos).
 */
export async function uploadWorkOrderImage(
  formData: FormData,
): Promise<UploadWOImageResult> {
  const t = await getTranslations("errors");
  const woId = formData.get("woId");
  const file = formData.get("file");

  if (typeof woId !== "string" || woId.length === 0) {
    return { ok: false, error: t("missingWorkOrderId") };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("woNoFileReceived") };
  }
  if (file.size > 5 * 1024 * 1024) {
    return {
      ok: false,
      error: t("woFileTooLarge"),
    };
  }

  const supabase = createServiceClient();

  const ext = file.type === "image/jpeg" ? "jpg" : "webp";
  const objectPath = `work-orders/${woId}/${crypto.randomUUID()}.${ext}`;
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

  const { data: inserted, error: insertErr } = await supabase
    .from("attachments")
    .insert({
      entity_type: "work_order",
      entity_id: woId,
      file_url: publicUrl,
      file_name: file.name || objectPath,
      file_size_bytes: file.size,
      mime_type: file.type || "image/webp",
      purpose: "gallery",
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: t("woCouldNotSaveAttachment", {
        detail: insertErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      contentType: file.type === "image/jpeg" ? "image/jpeg" : "image/webp",
      upsert: false,
    });
  if (uploadErr) {
    const { error: cleanupErr } = await supabase
      .from("attachments")
      .delete()
      .eq("id", inserted.id);
    const cleanup = cleanupErr
      ? t("woUploadCleanupFailed", { detail: cleanupErr.message })
      : "";
    return {
      ok: false,
      error: t("woUploadFailed", {
        detail: `${uploadErr.message}.${cleanup}`,
      }),
    };
  }

  revalidatePath(`/work/${woId}`);
  revalidatePath(`/maintenance/work-orders/${woId}`);

  return { ok: true, attachmentId: inserted.id };
}
