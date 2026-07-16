/**
 * Twilio telephony adapter (Slice F) — no SDK, thin fetch/crypto, same house
 * pattern as src/lib/email/send.ts and src/lib/economic/client.ts. The auth
 * token + account SID are SECRETS (env `TWILIO_AUTH_TOKEN` /
 * `TWILIO_ACCOUNT_SID`); the phone numbers are operational config in
 * app_settings. Provider endpoints are hardcoded here per the config doctrine.
 *
 * Responsibilities:
 *   - validate the X-Twilio-Signature on inbound webhooks (the security gate),
 *   - build the bilingual voicemail TwiML (GDPR "call is recorded" notice),
 *   - fetch a finished recording's audio and delete the Twilio copy, so the
 *     only durable audio lives in Supabase Storage (EU).
 *
 * Node runtime only (uses `node:crypto` + `Buffer`).
 */
import crypto from "node:crypto";

const TWILIO_API_BASE = "https://api.twilio.com";

// ── Request signature validation ────────────────────────────────────────────

/**
 * Validate an X-Twilio-Signature for an x-www-form-urlencoded webhook POST.
 * The signed string is the full public URL Twilio requested, followed by each
 * POST param appended as key+value in alphabetical key order, HMAC-SHA1'd with
 * the auth token and base64-encoded. Timing-safe compare.
 */
export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * The public origin Twilio used to reach us, reconstructed from forwarding
 * headers (Vercel / tunnel put the public host here, not `request.url`'s
 * internal host). Used both to rebuild the URL for signature checking and to
 * build the recording-callback URL Twilio will sign in turn.
 */
export function publicOrigin(request: Request): string {
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `${proto}://${host}`;
}

/** The exact public URL of this request, for signature validation. */
export function signedRequestUrl(request: Request): string {
  const u = new URL(request.url);
  return `${publicOrigin(request)}${u.pathname}${u.search}`;
}

/** Collect x-www-form-urlencoded fields into a plain record (for signing + reads). */
export function formParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") params[k] = v;
  }
  return params;
}

// ── TwiML ───────────────────────────────────────────────────────────────────

const GREETING_DA =
  "Velkommen til Jensen Production. Vi kan ikke tage telefonen lige nu. Læg venligst en besked efter tonen. Denne samtale bliver optaget. Fortæl os dit navn, din organisation, og hvad det drejer sig om.";
const GREETING_EN =
  "You have reached Jensen Production. We cannot take your call right now. Please leave a message after the tone. This call is recorded. Tell us your name, your organization, and what it is about.";
const GOODBYE_DA = "Vi modtog ikke en besked. Farvel.";
const GOODBYE_EN = "We did not receive a message. Goodbye.";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Voicemail TwiML: bilingual recorded-call notice, record up to 2 minutes,
 * then Twilio POSTs the recording to `recordingCallbackUrl` when it's ready.
 */
export function voicemailTwiml(recordingCallbackUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="da-DK">${escapeXml(GREETING_DA)}</Say>
  <Say language="en-US">${escapeXml(GREETING_EN)}</Say>
  <Record maxLength="120" playBeep="true" finishOnKey="#" recordingStatusCallback="${escapeXml(recordingCallbackUrl)}" recordingStatusCallbackEvent="completed" />
  <Say language="da-DK">${escapeXml(GOODBYE_DA)}</Say>
  <Say language="en-US">${escapeXml(GOODBYE_EN)}</Say>
</Response>`;
}

// ── Recording media: fetch + delete ──────────────────────────────────────────

function basicAuth(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

export type FetchRecordingResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; detail: string };

/** Download a finished recording as MP3 (Basic auth with the account creds). */
export async function fetchTwilioRecording(
  recordingUrl: string,
  accountSid: string,
  authToken: string,
): Promise<FetchRecordingResult> {
  let res: Response;
  try {
    res = await fetch(`${recordingUrl}.mp3`, {
      headers: { Authorization: basicAuth(accountSid, authToken) },
    });
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) return { ok: false, detail: `fetch ${res.status}` };
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    ok: true,
    bytes,
    contentType: res.headers.get("content-type") ?? "audio/mpeg",
  };
}

/**
 * Delete a recording from Twilio so the only durable audio lives in Supabase
 * EU. 404 counts as success (already gone). Never throws.
 */
export async function deleteTwilioRecording(
  accountSid: string,
  authToken: string,
  recordingSid: string,
): Promise<{ ok: boolean; detail?: string }> {
  const url = `${TWILIO_API_BASE}/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.json`;
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: basicAuth(accountSid, authToken) },
    });
    if (res.ok || res.status === 404) return { ok: true };
    return { ok: false, detail: `delete ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
