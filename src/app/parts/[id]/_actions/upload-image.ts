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
 *
 * Order: row-first, file-second.
 *   1. Generate the storage path UUID locally (deterministic publicUrl).
 *   2. INSERT the attachments row pointing at the path the file WILL live at.
 *   3. Upload the file. If upload fails, hard-delete the row.
 *
 * The L2 walkthrough caught a silent orphan from the previous "upload-first"
 * order: when the row-insert step failed silently, the rollback `remove()`
 * sometimes failed too, leaving a file in the bucket with no row pointing to
 * it. Inverting the order means the worst case is a row pointing at a
 * not-yet-uploaded path (which renders a broken thumb the user can act on),
 * not an invisible bandwidth-wasting orphan. The user-facing failure is louder
 * but properly recoverable.
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

  const ext = file.type === "image/jpeg" ? "jpg" : "webp";
  const objectPath = `${partId}/${crypto.randomUUID()}.${ext}`;
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

  // Step 1: insert the attachments row pointing at the path the file will
  // live at. If this fails, nothing else has happened yet — clean exit.
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
    return {
      ok: false,
      error: `Could not save attachment: ${insertErr?.message ?? "unknown error"}`,
    };
  }

  // Step 2: upload the bytes. If this fails, hard-delete the row we just
  // created so we don't leave a row pointing at a missing file.
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

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);

  return { ok: true, attachmentId: inserted.id };
}
