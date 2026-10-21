import "server-only";

import { googleAccessToken } from "@/lib/google/service-account";

import type { SpeechResult } from "./elevenlabs";

/**
 * Text → speech through Google Cloud Text-to-Speech — what Munin's secretary
 * speaks with, and the same voices: WaveNet F for Danish, Chirp 3 HD Aoede
 * for English. Signed in as the shop's service account (the calendar's key,
 * scope `cloud-platform`). The API must be ENABLED once on that key's own
 * Google Cloud project; until then Google answers 403 SERVICE_DISABLED, read
 * here as `unavailable` so the browser's voice speaks instead. MP3. Never throws.
 */
const SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const TIMEOUT_MS = 15_000;

const VOICES: Record<"da" | "en", { languageCode: string; name: string }> = {
  da: { languageCode: "da-DK", name: "da-DK-Wavenet-F" },
  en: { languageCode: "en-US", name: "en-US-Chirp3-HD-Aoede" },
};

type GoogleError = { error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] } };

export async function synthesizeGoogle(text: string, language: "da" | "en"): Promise<SpeechResult> {
  const token = await googleAccessToken(SCOPE);
  if (!token.ok) return { ok: false, reason: "unavailable", detail: token.error };
  let res: Response;
  try {
    res = await fetch(SYNTHESIZE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token.value}`, "content-type": "application/json" },
      body: JSON.stringify({ input: { text }, voice: VOICES[language], audioConfig: { audioEncoding: "MP3" } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
  const json = (await res.json().catch(() => null)) as ({ audioContent?: string } & GoogleError) | null;
  if (res.ok && json?.audioContent) return { ok: true, base64: json.audioContent };
  const err = json?.error;
  const detail = [res.status, err?.status, err?.message?.slice(0, 200)].filter(Boolean).join(" ");
  // Not enabled on the project, or the key may not use it: nothing to retry.
  const disabled =
    res.status === 403 ||
    (err?.details ?? []).some((d) => d?.reason === "SERVICE_DISABLED") ||
    /has not been used in project|is disabled/i.test(err?.message ?? "");
  return { ok: false, reason: disabled ? "unavailable" : "error", detail };
}
