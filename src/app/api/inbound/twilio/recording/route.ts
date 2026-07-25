import { after } from "next/server";
import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { runInboundPipeline } from "@/lib/inbound/pipeline";
import type { VoicemailChannelMeta } from "@/lib/inbound/types";
import {
  deleteTwilioRecording,
  fetchTwilioRecording,
  formParams,
  verifyTwilioRequest,
} from "@/lib/inbound/telephony/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Give the after() pipeline (transcription poll + extraction) room past the
// fast ack. Vercel clamps to the plan max; if it's cut short, the row still
// stores and the review UI's "Run whole pipeline" reprocesses it.
export const maxDuration = 60;

const BUCKET = "inbound";

/**
 * Twilio recording-status callback (Slice F). Fires when a voicemail
 * recording is ready. We validate the signature, pull the audio into Supabase
 * Storage (EU), DELETE the Twilio copy once ours is stored, converge on the row
 * (created here OR already created by the call-status callback — reconciled by
 * CallSid), and — after responding — run the pipeline so a review row is
 * waiting. Shadow mode: nothing reaches the customer.
 *
 * Always acks 204 once the signature is valid, even on a fetch/upload hiccup —
 * a non-2xx makes Twilio retry the callback indefinitely.
 */
export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const form = await request.formData();
  const params = formParams(form);
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (!verifyTwilioRequest(request, params, signature) || !accountSid || !authToken) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const recordingUrl = params.RecordingUrl;
  const recordingSid = params.RecordingSid;
  const callSid = params.CallSid || null;
  // No recording (caller hung up before the beep) → the status callback
  // captures the hang-up; nothing to store here.
  if (!recordingUrl || !recordingSid) {
    return new NextResponse(null, { status: 204 });
  }

  const supabase = createServiceClient();

  // Reconcile by CallSid: the status callback may have created a contentless
  // row for this call first, or a retry may already have stored the recording.
  const { data: existing } = callSid
    ? await supabase
        .from("inbound_messages")
        .select("id, media_path, channel_meta")
        .eq("channel_meta->>twilio_call_sid", callSid)
        .maybeSingle()
    : { data: null };

  // Recording already stored on this call (Twilio retried the callback).
  if (existing?.media_path) return new NextResponse(null, { status: 204 });

  // Bridge mode: the voice route tags the callback URL when this recording is a
  // two-way CONVERSATION rather than a voicemail (signed query — see the voice
  // route). It changes the channel, the outcome and the extraction prompt.
  const query = new URL(request.url).searchParams;
  const isBridged = query.get("mode") === "bridged";
  const recordingChannels = params.RecordingChannels
    ? Number(params.RecordingChannels)
    : undefined;

  // Pull the audio to EU storage, then delete the Twilio copy — but ONLY once
  // our copy actually exists. Deleting after a failed fetch/upload would leave
  // ZERO copies of the call: fetch-and-delete exists to make Supabase the one
  // custodian, not to destroy the audio.
  const fetched = await fetchTwilioRecording(recordingUrl, accountSid, authToken);
  let objectPath: string | null = null;
  if (fetched.ok) {
    objectPath = `${isBridged ? "call" : "voicemail"}/${crypto.randomUUID()}.mp3`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, fetched.bytes, {
        contentType: "audio/mpeg",
        upsert: false,
      });
    if (uploadErr) objectPath = null;
  }
  // When our side failed, Twilio's copy is the only fallback, so keep it: a
  // callback retry re-enters here (the media_path guard above only short-circuits
  // once the audio IS stored) and can still pull it. The cost is that a kept
  // copy sits outside our retention cron (which walks media_path) on a Twilio
  // media URL that is unauthenticated by default — so the row carries a loud
  // error and the Inbox shows it rather than letting it linger unnoticed.
  const del: { ok: boolean; detail?: string } = objectPath
    ? await deleteTwilioRecording(accountSid, authToken, recordingSid)
    : { ok: false, detail: "kept: our copy failed" };

  // Caller identity rides on the signed callback URL's query (the recording
  // callback body itself has no From/To — see the voice route).
  const fromNumber = query.get("from") || params.From || null;
  const toNumber = query.get("to") || params.To || undefined;

  const recordingMeta: VoicemailChannelMeta = {
    source: "twilio",
    original_filename: `${recordingSid}.mp3`,
    twilio_call_sid: params.CallSid,
    twilio_recording_sid: recordingSid,
    twilio_recording_seconds: params.RecordingDuration
      ? Number(params.RecordingDuration)
      : undefined,
    to_number: toNumber,
    twilio_deleted: del.ok,
    call_mode: isBridged ? "bridged" : "voicemail",
    recording_channels: recordingChannels,
  };

  const rowFields = {
    // A bridged recording is a conversation, not a message left — its own
    // channel, because the transcript shape and review copy both differ.
    channel: (isBridged ? "phone_call" : "voicemail") as
      | "phone_call"
      | "voicemail",
    from_identity: fromNumber,
    media_path: objectPath,
    media_mime_type: objectPath ? "audio/mpeg" : null,
    call_outcome: isBridged ? "answered" : "message_left",
    status: "received" as const,
    error: objectPath
      ? null
      : "twilio: recording fetch/upload failed — the Twilio copy was KEPT (not deleted) so the audio is still recoverable; it is outside our retention cron until then",
  };

  let id: string | null = null;
  if (existing) {
    // The status callback created a contentless row first — attach the
    // recording (merging its channel_meta) and flip it to a real voicemail.
    const merged = {
      ...((existing.channel_meta as Record<string, unknown>) ?? {}),
      ...recordingMeta,
    };
    await supabase
      .from("inbound_messages")
      .update({ ...rowFields, channel_meta: merged })
      .eq("id", existing.id);
    id = existing.id;
  } else {
    const { data: inserted } = await supabase
      .from("inbound_messages")
      .insert({ channel_meta: recordingMeta, ...rowFields })
      .select("id")
      .maybeSingle();
    id = inserted?.id ?? null;
    // Lost the race: the status callback inserted between our SELECT and
    // INSERT (unique index on CallSid). Re-find and update that row instead.
    if (!id && callSid) {
      const { data: raced } = await supabase
        .from("inbound_messages")
        .select("id, channel_meta")
        .eq("channel_meta->>twilio_call_sid", callSid)
        .maybeSingle();
      if (raced) {
        const merged = {
          ...((raced.channel_meta as Record<string, unknown>) ?? {}),
          ...recordingMeta,
        };
        await supabase
          .from("inbound_messages")
          .update({ ...rowFields, channel_meta: merged })
          .eq("id", raced.id);
        id = raced.id;
      }
    }
  }

  // Process after responding so Twilio gets a fast ack. Failures are stamped
  // onto the row by the pipeline; the review UI's "Run whole pipeline" retries.
  if (id && objectPath) {
    const messageId = id;
    after(async () => {
      try {
        await runInboundPipeline(createServiceClient(), messageId, "da");
      } catch {
        /* pipeline stamps its own failure on the row */
      }
    });
  }

  return new NextResponse(null, { status: 204 });
}
