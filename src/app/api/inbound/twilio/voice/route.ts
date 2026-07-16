import { NextResponse } from "next/server";

import {
  formParams,
  publicOrigin,
  signedRequestUrl,
  validateTwilioSignature,
  voicemailTwiml,
} from "@/lib/inbound/telephony/twilio";

// Twilio POSTs x-www-form-urlencoded; we need Node (crypto/Buffer) and no
// caching — every call is fresh.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio "A call comes in" webhook (Slice F). Validates the request signature,
 * then returns voicemail TwiML: the bilingual recorded-call notice, a 2-minute
 * record, and a recording callback pointed back at this deployment's public
 * origin (so the URL Twilio signs on the callback matches what we validate).
 *
 * Point the DK production number here in prod; the Twilio trial number here
 * (under a tunnel) for the smoke test. The signature is the security gate —
 * an unsigned or wrong-token request gets a 403 and no TwiML.
 */
export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const form = await request.formData();
  const params = formParams(form);
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (
    !authToken ||
    !validateTwilioSignature(
      authToken,
      signedRequestUrl(request),
      params,
      signature,
    )
  ) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const callbackUrl = `${publicOrigin(request)}/api/inbound/twilio/recording`;
  return new NextResponse(voicemailTwiml(callbackUrl), {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
