import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { bridgingReady, loadInboundSettings } from "@/lib/inbound/settings";
import {
  bridgeTwiml,
  dialActionUrl,
  formParams,
  recordingCallbackUrl,
  verifyTwilioRequest,
  voicemailTwiml,
} from "@/lib/inbound/telephony/twilio";

// Twilio POSTs x-www-form-urlencoded; we need Node (crypto/Buffer) and no
// caching — every call is fresh.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio "A call comes in" webhook (Slice F + live-call bridging). Validates
 * the request signature, then answers per `app_settings.inbound_call_mode`:
 *
 *   voicemail (default) — bilingual recorded-call notice, 2-minute <Record>.
 *   bridge             — notice, then ring `inbound_bridge_number` and record
 *                        the CONVERSATION in dual channel; the <Dial action>
 *                        route falls through to voicemail on no-answer.
 *
 * Bridging is inert unless a number is configured, so a half-finished setup
 * degrades to today's voicemail rather than dropping the call.
 * See docs/plan-live-call-recording.md.
 *
 * The signature is the security gate — an unsigned or wrong-token request gets
 * a 403 and no TwiML.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const params = formParams(form);
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (!verifyTwilioRequest(request, params, signature)) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  // Twilio's recording callback omits From/To, so thread the caller identity
  // through the callback URL — Twilio signs the full URL, so it arrives
  // authenticated. This is what lets the matcher run its phone→contact probe.
  const identity = { from: params.From ?? "", to: params.To ?? "" };

  const settings = await loadInboundSettings(createServiceClient());

  if (bridgingReady(settings) && settings.bridgeNumber) {
    const twiml = bridgeTwiml({
      dialNumber: settings.bridgeNumber,
      timeoutSeconds: settings.bridgeTimeoutSeconds,
      actionUrl: dialActionUrl(request, identity),
      // `mode=bridged` tells the recording route this is a two-way call, not a
      // voicemail — it drives the channel, the outcome and the dialogue prompt.
      recordingCallbackUrl: recordingCallbackUrl(request, {
        ...identity,
        mode: "bridged",
      }),
      // Present the number the customer dialled, not their own, to the mobile.
      callerId: params.To ?? null,
    });
    return xml(twiml);
  }

  return xml(voicemailTwiml(recordingCallbackUrl(request, identity)));
}

function xml(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
