import type { SupabaseClient } from "@supabase/supabase-js";

import { repairMixedMp3 } from "./mp3-repair";

const BUCKET = "inbound";

/**
 * Make a message's audio something the transcription provider will accept,
 * BEFORE it is sent — so every source (call import, Twilio, an upload) and
 * every retry ("Run whole pipeline") gets the same fix.
 *
 * Today that is one repair: an MP3 whose frames change format partway (see
 * ./mp3-repair.ts). The repaired copy becomes `media_path` — what the player
 * plays and the provider hears — and the original stays in storage at
 * `channel_meta.original_media_path`, so nothing the phone system recorded is
 * thrown away; the retention job removes both. Idempotent: a repaired row
 * already carries `audio_repair` and is not looked at again.
 *
 * Any failure here returns the path unchanged: a repair that cannot run must
 * not block the transcription attempt, which reports its own error.
 */
export async function ensureTranscribableAudio(
  supabase: SupabaseClient,
  msg: {
    id: string;
    media_path: string;
    media_mime_type?: string | null;
    channel_meta?: unknown;
  },
): Promise<string> {
  const meta = (msg.channel_meta ?? {}) as Record<string, unknown>;
  const isMp3 =
    msg.media_mime_type === "audio/mpeg" || msg.media_path.toLowerCase().endsWith(".mp3");
  if (!isMp3 || meta.audio_repair) return msg.media_path;

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(msg.media_path);
  if (error || !blob) return msg.media_path;
  const repair = repairMixedMp3(await blob.arrayBuffer());
  if (!repair) return msg.media_path;

  const cleanPath = msg.media_path.replace(/(\.mp3)?$/i, ".clean.mp3");
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(cleanPath, repair.bytes, { contentType: "audio/mpeg", upsert: true });
  if (upErr) return msg.media_path;

  const { error: rowErr } = await supabase
    .from("inbound_messages")
    .update({
      media_path: cleanPath,
      media_mime_type: "audio/mpeg",
      channel_meta: {
        ...meta,
        original_media_path: msg.media_path,
        audio_repair: {
          reason: "mixed_mp3_formats",
          kept_seconds: repair.keptSeconds,
          total_seconds: repair.totalSeconds,
          runs: repair.runs,
        },
      },
    })
    .eq("id", msg.id);
  if (rowErr) {
    await supabase.storage.from(BUCKET).remove([cleanPath]);
    return msg.media_path;
  }
  return cleanPath;
}
