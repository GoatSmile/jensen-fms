/**
 * Voicemail channel adapter — owns how a voicemail's channel payload (audio
 * in the private `inbound` bucket) becomes the normalized `body_text` the
 * channel-blind pipeline (extract → match) reads. Transcription is
 * voicemail-shaped, so it lives behind this adapter; future channels (email,
 * WhatsApp) implement their own "understand" step and never touch this.
 *
 * The DB write stays in the caller (server action) — this returns the text +
 * detected language, same division of labour as match.ts / extract.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { transcribeAudio, type TranscribeResult } from "../transcribe";
import type { InboundSettings } from "../settings";

// The provider fetches the audio within seconds; keep the window tight.
const SIGNED_URL_TTL_SECONDS = 600;

export async function transcribeVoicemail(
  supabase: SupabaseClient,
  mediaPath: string,
  settings: InboundSettings,
  /**
   * Set for a live bridged call: the recording is a two-way CONVERSATION in
   * dual channel, so it wants per-channel (or diarized) speaker attribution
   * and the call-path provider — see docs/plan-live-call-recording.md.
   */
  opts: { twoWay?: boolean } = {},
): Promise<TranscribeResult> {
  const { data: signed, error } = await supabase.storage
    .from("inbound")
    .createSignedUrl(mediaPath, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    return {
      ok: false,
      reason: "api_error",
      detail: error?.message ?? "could not sign media URL",
    };
  }
  return transcribeAudio(signed.signedUrl, {
    provider: opts.twoWay
      ? settings.callTranscriptionProvider
      : settings.transcriptionProvider,
    region: settings.transcriptionRegion,
    channels: opts.twoWay ? 2 : 1,
  });
}
