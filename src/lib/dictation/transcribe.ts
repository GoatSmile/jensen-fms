"use client";

import { mintDictationUpload } from "@/app/_actions/dictation";

export type TranscribeResult =
  | { ok: true; text: string; /** What was heard, when it is one of ours. */ language: "da" | "en" | null }
  | { ok: false; reason: string; detail?: string };

/**
 * A captured WAV → its text, through the same provider as every other
 * dictation: mint a signed URL, PUT the bytes straight to storage (they never
 * ride a server action — Vercel's request cap), then /api/dictate. `reason` is
 * /api/dictate's message key, or `upload` when the bytes never got there.
 * `language` is the fallback when detection misses, not a pin.
 */
export async function transcribeRecording(blob: Blob, language: "da" | "en"): Promise<TranscribeResult> {
  try {
    const minted = await mintDictationUpload();
    if (!minted.ok) return { ok: false, reason: "upload", detail: minted.error };
    const put = await fetch(minted.signedUrl, {
      method: "PUT",
      headers: { "content-type": "audio/wav" },
      body: blob,
    });
    if (!put.ok) return { ok: false, reason: "upload", detail: `upload ${put.status}` };
    const res = await fetch("/api/dictate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: minted.path, language }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; text: string; language?: unknown }
      | { ok: false; reason: string }
      | null;
    if (!json) return { ok: false, reason: "api_error", detail: `dictate ${res.status}` };
    if (!json.ok) return { ok: false, reason: json.reason };
    const heard = json.language === "da" || json.language === "en" ? json.language : null;
    return { ok: true, text: json.text, language: heard };
  } catch (e) {
    // Offline, storage refused, server unreachable.
    return { ok: false, reason: "upload", detail: e instanceof Error ? e.message : String(e) };
  }
}
