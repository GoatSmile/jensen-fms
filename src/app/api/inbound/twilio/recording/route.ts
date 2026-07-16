import { after } from "next/server";
import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { runInboundPipeline } from "@/lib/inbound/pipeline";
import type { VoicemailChannelMeta } from "@/lib/inbound/types";
import {
  deleteTwilioRecording,
  fetchTwilioRecording,
  formParams,
  signedRequestUrl,
  validateTwilioSignature,
} from "@/lib/inbound/telephony/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "inbound";

/**
 * Twilio recording-status callback (Slice F). Fires when a voicemail
 * recording is ready. We: validate the signature, pull the audio into
 * Supabase Storage (EU), DELETE the Twilio copy immediately (the only durable
 * audio then lives in the EU bucket), create the `inbound_messages` row, and —
 * after responding — run the pipeline (transcribe → extract → match) so a
 * review row is waiting. Shadow mode: nothing reaches the customer.
 *
 * Always acks with 204 once the signature is valid, even on a fetch/upload
 * hiccup — a non-2xx makes Twilio retry the callback indefinitely. Failures
 * are recorded on the row / left for the "Run whole pipeline" button instead.
 */
export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const form = await request.formData();
  const params = formParams(form);
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (
    !authToken ||
    !accountSid ||
    !validateTwilioSignature(
      authToken,
      signedRequestUrl(request),
      params,
      signature,
    )
  ) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const recordingUrl = params.RecordingUrl;
  const recordingSid = params.RecordingSid;
  // No recording (caller hung up before the beep) → nothing to store.
  if (!recordingUrl || !recordingSid) {
    return new NextResponse(null, { status: 204 });
  }

  const supabase = createServiceClient();

  // Idempotency: Twilio retries on any non-2xx, so guard on the recording SID.
  const { data: existing } = await supabase
    .from("inbound_messages")
    .select("id")
    .eq("channel_meta->>twilio_recording_sid", recordingSid)
    .maybeSingle();
  if (existing) return new NextResponse(null, { status: 204 });

  // Pull the audio to EU storage, then delete the Twilio copy.
  const fetched = await fetchTwilioRecording(recordingUrl, accountSid, authToken);
  let objectPath: string | null = null;
  if (fetched.ok) {
    objectPath = `voicemail/${crypto.randomUUID()}.mp3`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, fetched.bytes, {
        contentType: "audio/mpeg",
        upsert: false,
      });
    if (uploadErr) objectPath = null;
  }
  const del = await deleteTwilioRecording(accountSid, authToken, recordingSid);

  const channelMeta: VoicemailChannelMeta = {
    source: "twilio",
    original_filename: `${recordingSid}.mp3`,
    twilio_call_sid: params.CallSid,
    twilio_recording_sid: recordingSid,
    twilio_recording_seconds: params.RecordingDuration
      ? Number(params.RecordingDuration)
      : undefined,
    to_number: params.To,
    twilio_deleted: del.ok,
  };

  const { data: inserted } = await supabase
    .from("inbound_messages")
    .insert({
      channel: "voicemail",
      status: "received",
      from_identity: params.From ?? null,
      media_path: objectPath,
      media_mime_type: objectPath ? "audio/mpeg" : null,
      channel_meta: channelMeta,
      error: objectPath ? null : "twilio: recording fetch/upload failed",
    })
    .select("id")
    .single();

  // Process after responding so Twilio gets a fast ack. Failures are stamped
  // onto the row by the pipeline; the review UI's "Run whole pipeline" retries.
  if (inserted?.id && objectPath) {
    const id = inserted.id;
    after(async () => {
      try {
        await runInboundPipeline(createServiceClient(), id, "da");
      } catch {
        /* pipeline stamps its own failure on the row */
      }
    });
  }

  return new NextResponse(null, { status: 204 });
}
