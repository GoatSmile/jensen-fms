"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "part-images";

export type UploadImageResult =
  | { ok: true; attachmentId: string }
  | { ok: false; error: string };

/**
 * Accepts a resized WebP blob from the client (see `resizeImageForUpload`),
 * uploads it to Supabase Storage, then inserts a row in `attachments` linking
 * it to the part. The first photo for a part is automatically promoted to
 * hero so newly-photographed parts have a header thumbnail without an extra
 * click; subsequent photos land as gallery entries.
 *
 * Storage object path: <partId>/<random>.webp — partition by part to make
 * future per-part cleanup straightforward.
 */
export async function uploadPartImage(
  formData: FormData,
): Promise<UploadImageResult> {
  const partId = formData.get("partId");
  const file = formData.get("file");

  if (typeof partId !== "string" || partId.length === 0) {
    return { ok: false, error: "Missing partId." };
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

  // Decide hero vs gallery up front: the first photo on a part becomes hero.
  const { count: existingCount, error: countErr } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "part")
    .eq("entity_id", partId)
    .is("deleted_at", null);
  if (countErr) {
    return { ok: false, error: `Could not count photos: ${countErr.message}` };
  }
  const purpose = (existingCount ?? 0) === 0 ? "hero" : "gallery";

  const objectPath = `${partId}/${crypto.randomUUID()}.webp`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      contentType: "image/webp",
      upsert: false,
    });
  if (uploadErr) {
    return { ok: false, error: `Upload failed: ${uploadErr.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

  const { data: inserted, error: insertErr } = await supabase
    .from("attachments")
    .insert({
      entity_type: "part",
      entity_id: partId,
      file_url: publicUrl,
      file_name: file.name || objectPath,
      file_size_bytes: file.size,
      mime_type: file.type || "image/webp",
      purpose,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    // Best-effort rollback so we don't leave an orphan blob in the bucket.
    await supabase.storage.from(BUCKET).remove([objectPath]);
    return {
      ok: false,
      error: `Could not save attachment: ${insertErr?.message ?? "unknown error"}`,
    };
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);

  return { ok: true, attachmentId: inserted.id };
}
