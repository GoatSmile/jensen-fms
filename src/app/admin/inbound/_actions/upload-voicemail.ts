"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import type { VoicemailChannelMeta } from "@/lib/inbound/types";

const BUCKET = "inbound";
const MAX_BYTES = 25 * 1024 * 1024; // mirrors the bucket's 25 MB cap

/**
 * Harness ingress for Slice A: upload a hand-recorded voicemail so the rest
 * of the pipeline (transcribe → extract → match → ticket) can be built and
 * tuned with zero telephony cost. Twilio (Slice F) becomes a second writer
 * of the same `inbound_messages` row shape.
 *
 * Private bucket → both write (here) and later read (signed URL) go through
 * the service client; the anon role has no storage policy on `inbound`.
 *
 * Order mirrors the image uploads (row-first, file-second) so a failed
 * upload can hard-delete its row instead of leaving an invisible orphan.
 */
export type UploadVoicemailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function uploadVoicemail(
  formData: FormData,
): Promise<UploadVoicemailResult> {
  const t = await getTranslations("errors");
  const file = formData.get("file");
  const fromIdentity = formData.get("fromIdentity");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("inboundNoFile") };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: t("inboundFileTooLarge") };
  }
  // Container MIME reporting is unreliable across phones/browsers (m4a →
  // audio/mp4, audio/x-m4a, even video/mp4). Accept audio/* and the common
  // video/mp4 wrapper; the transcription stage (B) is the real validator.
  const mime = file.type || "application/octet-stream";
  const looksAudio =
    mime.startsWith("audio/") || mime === "video/mp4" || mime === "video/webm";
  if (!looksAudio) {
    return { ok: false, error: t("inboundNotAudio", { type: mime }) };
  }

  const supabase = createServiceClient();

  // Keep the original extension so the audio element gets a sensible type
  // hint; fall back to a generic one.
  const dotExt = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : ".bin";
  const objectPath = `voicemail/${crypto.randomUUID()}${dotExt}`;

  const channelMeta: VoicemailChannelMeta = {
    original_filename: file.name || objectPath,
    size_bytes: file.size,
    source: "harness_upload",
  };

  // Step 1: insert the row pointing at the path the file WILL live at.
  const { data: inserted, error: insertErr } = await supabase
    .from("inbound_messages")
    .insert({
      channel: "voicemail",
      status: "received",
      from_identity:
        typeof fromIdentity === "string" && fromIdentity.trim().length > 0
          ? fromIdentity.trim()
          : null,
      media_path: objectPath,
      media_mime_type: mime,
      channel_meta: channelMeta,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: t("inboundCouldNotSave", {
        detail: insertErr?.message ?? t("unknownError"),
      }),
    };
  }

  // Step 2: upload the bytes; on failure, hard-delete the row so we don't
  // leave a row pointing at a missing file.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, { contentType: mime, upsert: false });
  if (uploadErr) {
    await supabase.from("inbound_messages").delete().eq("id", inserted.id);
    return {
      ok: false,
      error: t("inboundUploadFailed", { detail: uploadErr.message }),
    };
  }

  revalidatePath("/admin/inbound");
  return { ok: true, id: inserted.id };
}
