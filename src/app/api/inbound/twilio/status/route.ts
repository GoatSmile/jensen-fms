import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import type { VoicemailChannelMeta } from "@/lib/inbound/types";
import { applyTriage } from "@/lib/inbound/triage";
import { formParams, verifyTwilioRequest } from "@/lib/inbound/telephony/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Terminal call statuses worth recording. Intermediate events (initiated,
// ringing, in-progress) are ignored — we only capture the completed event's
// duration + outcome.
const TERMINAL = new Set([
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);

/**
 * Twilio call-STATUS callback (triage layer 1 — capture every call event).
 * Configured on the number's "Call status changes" field (see the settings
 * hint). Fires on every call completion, INCLUDING hang-ups that never left a
 * message — which the recording callback never sees. We record duration +
 * outcome, and create a contentless row for a no-message call.
 *
 * One row per call, correlated by CallSid: if the recording callback already
 * created (or will create) the row, we converge on it rather than duplicate —
 * enforced by the partial unique index (migration 69). Always acks 204 once
 * the signature is valid so Twilio doesn't retry-storm.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const params = formParams(form);
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (!verifyTwilioRequest(request, params, signature)) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const callSid = params.CallSid;
  const callStatus = params.CallStatus ?? "";
  if (!callSid || !TERMINAL.has(callStatus)) {
    return new NextResponse(null, { status: 204 });
  }

  const supabase = createServiceClient();
  const duration = params.CallDuration ? Number(params.CallDuration) : null;

  const { data: existing } = await supabase
    .from("inbound_messages")
    .select("id, media_path")
    .eq("channel_meta->>twilio_call_sid", callSid)
    .maybeSingle();

  // A row for this call already exists (the recording callback got here first,
  // or created it). Stamp the whole-call duration + outcome — but never
  // downgrade a message-left row.
  if (existing) {
    await supabase
      .from("inbound_messages")
      .update({
        duration_seconds: duration,
        call_outcome: existing.media_path ? "message_left" : outcomeFor(callStatus),
      })
      .eq("id", existing.id);
    return new NextResponse(null, { status: 204 });
  }

  // No row yet — record the contact attempt. If the caller actually left a
  // message, the recording callback reconciles onto THIS row by CallSid and
  // flips it into a real voicemail.
  const channelMeta: VoicemailChannelMeta = {
    source: "twilio",
    twilio_call_sid: callSid,
    to_number: params.To,
  };
  const { data: inserted, error } = await supabase
    .from("inbound_messages")
    .insert({
      channel: "voicemail",
      status: "received",
      from_identity: params.From ?? null,
      duration_seconds: duration,
      call_outcome: outcomeFor(callStatus),
      channel_meta: channelMeta,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Lost the race to the recording callback (unique index on CallSid) — it
    // owns the row now; nothing more to do.
    if (error.code !== "23505") {
      console.error("inbound status insert failed", error.message);
    }
  } else if (inserted) {
    // Score the hang-up (no pipeline runs for a contentless call).
    await applyTriage(supabase, inserted.id);
  }

  return new NextResponse(null, { status: 204 });
}

function outcomeFor(callStatus: string): string {
  return callStatus === "completed" ? "no_message" : callStatus;
}
