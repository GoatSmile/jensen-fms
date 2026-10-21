"use server";

import { readHasCapability } from "@/lib/auth/read-session";
import { ELEVENLABS_SPEECH_MODELS, ELEVENLABS_VOICE_ID, synthesizeElevenLabs } from "@/lib/speech/elevenlabs";

const SAMPLE = {
  da: "Hej. Jeg har booket leveringen af tretten cykler til i morgen klokken ni.",
  en: "Hi. I have booked the delivery of thirteen bikes for tomorrow at nine.",
} as const;

/**
 * One sample sentence in a chosen ElevenLabs voice and model — the admin's
 * Listen button, so a voice is picked by ear before it is saved. Gated here
 * (a server action is callable from anywhere) because every call is billed.
 */
export async function previewSpeech(input: {
  voiceId: string | null;
  model: string;
  language: "da" | "en";
}): Promise<{ ok: true; audio: string } | { ok: false; error: string }> {
  if (!(await readHasCapability("admin"))) return { ok: false, error: "not allowed" };
  if (input.voiceId && !ELEVENLABS_VOICE_ID.test(input.voiceId)) return { ok: false, error: "not a voice id" };
  if (!(ELEVENLABS_SPEECH_MODELS as readonly string[]).includes(input.model)) return { ok: false, error: "unknown model" };
  const lang = input.language === "en" ? "en" : "da";
  const r = await synthesizeElevenLabs(SAMPLE[lang], lang, { voiceId: input.voiceId, model: input.model });
  return r.ok ? { ok: true, audio: r.base64 } : { ok: false, error: r.detail ?? r.reason };
}
