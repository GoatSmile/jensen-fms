"use server";

import { readGate } from "@/lib/auth/read-session";
import { loadInboundSettings } from "@/lib/inbound/settings";
import { synthesizeElevenLabs } from "@/lib/speech/elevenlabs";
import { synthesizeGoogle } from "@/lib/speech/google";
import { createServiceClient } from "@/lib/supabase/service";

/** The longest answer read aloud — the assistant is told to keep replies short. */
const MAX_CHARS = 1500;

/** The secretary's answer as speech (MP3, base64), in the person's language. */
export async function speakAnswer(
  text: string,
  language: string,
): Promise<{ ok: true; audio: string } | { ok: false; reason: "unavailable" | "error" }> {
  const gate = await readGate();
  if (gate.kind === "anonymous") return { ok: false, reason: "error" };
  const body = typeof text === "string" ? text.trim().slice(0, MAX_CHARS) : "";
  if (!body) return { ok: false, reason: "error" };
  // The chosen voice (admin setting, migration 131).
  const { speechProvider } = await loadInboundSettings(createServiceClient());
  const lang = language === "en" ? "en" : "da";
  const r = speechProvider === "google" ? await synthesizeGoogle(body, lang) : await synthesizeElevenLabs(body, lang);
  if (!r.ok) {
    if (r.reason === "error") console.error("[speak]", r.detail);
    return { ok: false, reason: r.reason };
  }
  return { ok: true, audio: r.base64 };
}
