"use server";

import { revalidatePath } from "next/cache";

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
  const woId = formData.get("woId");
  const file = formData.get("file");

  if (typeof woId !== "string" || woId.length === 0) {
    return { ok: false, error: "Missing work order id." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file received." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return {
      ok: false,
      error: "File is larger than 5 MB after resize — please retry.",
    };
  }

  const supabase = createServiceClient();

  const objectPath = `work-orders/${woId}/${crypto.randomUUID()}.webp`;
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
      error: `Could not save attachment: ${insertErr?.message ?? "unknown error"}`,
    };
  }

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      contentType: "image/webp",
      upsert: false,
    });
  if (uploadErr) {
    const { error: cleanupErr } = await supabase
      .from("attachments")
      .delete()
      .eq("id", inserted.id);
    const detail = cleanupErr
      ? ` (and the placeholder row could not be cleaned up: ${cleanupErr.message})`
      : "";
    return {
      ok: false,
      error: `Upload failed: ${uploadErr.message}.${detail}`,
    };
  }

  revalidatePath(`/work/${woId}`);
  revalidatePath(`/maintenance/work-orders/${woId}`);

  return { ok: true, attachmentId: inserted.id };
}
