import { NextResponse } from "next/server";

import {
  formParams,
  hangUpTwiml,
  recordingCallbackUrl,
  verifyTwilioRequest,
  voicemailTwiml,
} from "@/lib/inbound/telephony/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `<Dial action>` callback for bridge mode (docs/plan-live-call-recording.md).
 * Twilio POSTs here when the dial attempt ends, with `DialCallStatus`:
 *
 *   completed          — they talked. The conversation recording is already on
 *                        its way to /recording; end the call cleanly. Returning
 *                        voicemail TwiML here would ask a customer who JUST
 *                        spoke to us to leave a message.
 *   no-answer|busy|
 *   failed|canceled    — nobody picked up → return the SAME voicemail TwiML the
 *                        voicemail mode uses, so the caller can leave a message.
 *                        Voicemail is the fallback, never skipped.
 *
 * Caller identity rides on this route's signed query string (set by the voice
 * route) and is threaded onward to the voicemail recording callback, because
 * Twilio's recording callback body carries no From/To.
 */
const NO_ANSWER = new Set(["no-answer", "busy", "failed", "canceled"]);

export async function POST(request: Request) {
  const form = await request.formData();
  const params = formParams(form);
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (!verifyTwilioRequest(request, params, signature)) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const status = params.DialCallStatus ?? "";
  const q = new URL(request.url).searchParams;
  const identity = {
    from: q.get("from") ?? params.From ?? "",
    to: q.get("to") ?? params.To ?? "",
  };

  const twiml = NO_ANSWER.has(status)
    ? voicemailTwiml(recordingCallbackUrl(request, identity))
    : hangUpTwiml();

  return new NextResponse(twiml, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
