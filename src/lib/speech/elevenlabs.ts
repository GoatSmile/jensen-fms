import "server-only";

/**
 * Text → speech through ElevenLabs, the provider transcription already uses
 * (same key, `ELEVENLABS_API_KEY`). One multilingual voice speaks Danish and
 * English; `language_code` pins which, from the person's own language.
 * MP3, the one format every phone browser plays. Never throws.
 *
 * `unavailable` = the key cannot speak (no key, or a key without the
 * `text_to_speech` permission — what the shop's key had on 2026-10-21): the
 * browser then speaks instead, so the secretary is never mute.
 */
const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const MODEL = "eleven_flash_v2_5";
const TIMEOUT_MS = 15_000;

export type SpeechResult = { ok: true; base64: string } | { ok: false; reason: "unavailable" | "error"; detail?: string };

export async function synthesizeElevenLabs(text: string, language: "da" | "en"): Promise<SpeechResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, reason: "unavailable", detail: "no key" };
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL, language_code: language }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "unavailable", detail: (await res.text().catch(() => "")).slice(0, 200) };
  }
  if (!res.ok) return { ok: false, reason: "error", detail: `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` };
  return { ok: true, base64: Buffer.from(await res.arrayBuffer()).toString("base64") };
}
