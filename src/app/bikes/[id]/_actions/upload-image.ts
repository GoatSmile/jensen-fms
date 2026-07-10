"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "bike-images";

export type UploadImageResult =
  | { ok: true; attachmentId: string }
  | { ok: false; error: string };

/**
 * Accepts a resized WebP blob from the client (see `resizeImageForUpload` in
 * @/lib/parts/image — same helper for bikes since the resize logic is
 * format-agnostic), uploads to the bike-images Supabase bucket, then inserts
 * an `attachments` row with entity_type='bike'.
 *
 * The first photo per bike auto-promotes to `purpose='hero'`. Order is
 * row-first, file-second to avoid bucket orphans on partial failure (same
 * reasoning as the parts version — see comment in
 * src/app/parts/[id]/_actions/upload-image.ts).
 */
export async function uploadBikeImage(
  formData: FormData,
): Promise<UploadImageResult> {
  const bikeId = formData.get("bikeId");
  const file = formData.get("file");

  if (typeof bikeId !== "string" || bikeId.length === 0) {
    return { ok: false, error: "Missing bikeId." };
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

  const { count: existingCount, error: countErr } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "bike")
    .eq("entity_id", bikeId)
    .is("deleted_at", null);
  if (countErr) {
    return { ok: false, error: `Could not count photos: ${countErr.message}` };
  }
  const purpose = (existingCount ?? 0) === 0 ? "hero" : "gallery";

  const ext = file.type === "image/jpeg" ? "jpg" : "webp";
  const objectPath = `${bikeId}/${crypto.randomUUID()}.${ext}`;
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

  const { data: inserted, error: insertErr } = await supabase
    .from("attachments")
    .insert({
      entity_type: "bike",
      entity_id: bikeId,
      file_url: publicUrl,
      file_name: file.name || objectPath,
      file_size_bytes: file.size,
      mime_type: file.type || "image/webp",
      purpose,
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
      contentType: file.type === "image/jpeg" ? "image/jpeg" : "image/webp",
      upsert: false,
    });
  if (uploadErr) {
    const { error: cleanupErr } = await supabase
      .from("attachments")
      .delete()
      .eq("id", inserted.id);
    const detail = cleanupErr
      ? ` (and the placeholder row could not be cleaned up: ${cleanupErr.message} — attachment id ${inserted.id})`
      : "";
    return {
      ok: false,
      error: `Upload failed: ${uploadErr.message}.${detail}`,
    };
  }

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);

  return { ok: true, attachmentId: inserted.id };
}
