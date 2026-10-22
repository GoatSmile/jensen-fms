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
/** "George" — a built-in English voice; the fallback when no voice is chosen for a language. */
export const DEFAULT_ELEVENLABS_VOICE = "JBFqnCBsd6RMkjVDRZzb";
/**
 * The models that read Danish and English, fastest first (migration 132).
 * Flash answers quickest; Multilingual v2 and v3 sound more natural and start
 * a little later — the choice is made by ear at /admin/settings.
 */
export const ELEVENLABS_SPEECH_MODELS = ["eleven_flash_v2_5", "eleven_multilingual_v2", "eleven_v3"] as const;
export type ElevenLabsSpeechModel = (typeof ELEVENLABS_SPEECH_MODELS)[number];
/** A voice id as ElevenLabs writes them; mirrored by the DB check (migration 132). */
export const ELEVENLABS_VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
const TIMEOUT_MS = 20_000;

export type SpeechResult = { ok: true; base64: string } | { ok: false; reason: "unavailable" | "error"; detail?: string };

export async function synthesizeElevenLabs(
  text: string,
  language: "da" | "en",
  opts: { voiceId?: string | null; model?: string } = {},
): Promise<SpeechResult> {
  const r = await requestSpeech(text, language, opts, false);
  if (!r.ok) return r;
  return { ok: true, base64: Buffer.from(await r.res.arrayBuffer()).toString("base64") };
}

/**
 * The same speech as it is MADE — ElevenLabs' streaming endpoint, so the
 * first words play while the rest is still being synthesised (owner,
 * 2026-10-22). The body is MP3 chunks, which every phone browser plays as
 * they arrive.
 */
export async function streamElevenLabs(
  text: string,
  language: "da" | "en",
  opts: { voiceId?: string | null; model?: string } = {},
): Promise<{ ok: true; stream: ReadableStream<Uint8Array> } | { ok: false; reason: "unavailable" | "error"; detail?: string }> {
  const r = await requestSpeech(text, language, opts, true);
  if (!r.ok) return r;
  if (!r.res.body) return { ok: false, reason: "error", detail: "no body" };
  return { ok: true, stream: r.res.body };
}

async function requestSpeech(
  text: string,
  language: "da" | "en",
  opts: { voiceId?: string | null; model?: string },
  stream: boolean,
): Promise<{ ok: true; res: Response } | { ok: false; reason: "unavailable" | "error"; detail?: string }> {
  const voice = opts.voiceId && ELEVENLABS_VOICE_ID.test(opts.voiceId) ? opts.voiceId : DEFAULT_ELEVENLABS_VOICE;
  const model = (ELEVENLABS_SPEECH_MODELS as readonly string[]).includes(opts.model ?? "") ? opts.model : "eleven_flash_v2_5";
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, reason: "unavailable", detail: "no key" };
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}${stream ? "/stream" : ""}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model, language_code: language }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "unavailable", detail: (await res.text().catch(() => "")).slice(0, 200) };
  }
  if (!res.ok) return { ok: false, reason: "error", detail: `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` };
  return { ok: true, res };
}

export type ElevenLabsVoice = { id: string; name: string; description: string | null; languages: string[] };

/**
 * The voices this ACCOUNT can speak with ("My Voices", library voices added
 * there included) — the admin picker. Needs the key's `voices_read`
 * permission; without it the admin types a voice id instead. Never throws.
 */
export async function listElevenLabsVoices(): Promise<
  { ok: true; voices: ElevenLabsVoice[] } | { ok: false; reason: "no_key" | "no_permission" | "error"; detail?: string }
> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };
  try {
    const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "no_permission" };
    if (!res.ok) return { ok: false, reason: "error", detail: String(res.status) };
    const json = (await res.json()) as {
      voices?: {
        voice_id: string;
        name: string;
        description?: string | null;
        labels?: Record<string, string>;
        verified_languages?: { language?: string; accent?: string }[];
      }[];
    };
    const voices = (json.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      description: [v.labels?.accent, v.labels?.gender, v.labels?.age, v.labels?.use_case].filter(Boolean).join(", ") || v.description || null,
      languages: [...new Set((v.verified_languages ?? []).map((l) => l.language).filter((l): l is string => Boolean(l)))],
    }));
    return { ok: true, voices };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}
