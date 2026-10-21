"use server";

import { readGate } from "@/lib/auth/read-session";
import { synthesizeElevenLabs } from "@/lib/speech/elevenlabs";

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
  const r = await synthesizeElevenLabs(body, language === "en" ? "en" : "da");
  if (!r.ok) {
    if (r.reason === "error") console.error("[speak]", r.detail);
    return { ok: false, reason: r.reason };
  }
  return { ok: true, audio: r.base64 };
}
