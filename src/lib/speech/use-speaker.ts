"use client";

import { useCallback, useEffect, useRef } from "react";

import { speakAnswer } from "@/app/_actions/speak";

/**
 * The secretary's voice (owner, 2026-10-21: "answers spoken back to me … in
 * Danish and English, depending on the user"). The server's voice first
 * (ElevenLabs, one voice in both languages); where the server cannot speak,
 * the browser's own speech, in the same language — so it is never mute.
 *
 * `prime()` must run INSIDE the press: iPhone Safari lets an audio element or
 * speech synthesis sound later only if it started inside a user gesture, and
 * the answer arrives seconds after the press (Munin's lesson).
 */
let serverCanSpeak = true;

export function useSpeaker() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const element = () => (audioRef.current ??= new Audio());

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a && !a.paused) a.pause();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* not supported */
    }
  }, []);

  const prime = useCallback(() => {
    try {
      const a = element();
      a.src = SILENT_WAV;
      void a.play().catch(() => {});
    } catch {
      /* no audio element */
    }
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch {
      /* no speech synthesis */
    }
  }, []);

  /**
   * Speak `text`; resolves when it has FINISHED (or could not start) — the cue
   * to listen again. With `messageId` (a stored secretary reply) it STREAMS
   * from /api/speak, so the first words play while the rest is still made;
   * if that stream fails before it plays, the whole-file path below runs.
   */
  const say = useCallback(
    async (text: string, language: "da" | "en", opts: { messageId?: string } = {}): Promise<void> => {
      const body = text.trim();
      if (!body) return;
      stop();
      if (serverCanSpeak && opts.messageId) {
        const a = element();
        a.src = `/api/speak?m=${encodeURIComponent(opts.messageId)}&lang=${language}`;
        if (await playStream(a)) return;
      }
      if (serverCanSpeak) {
        const r = await speakAnswer(body, language).catch(() => ({ ok: false as const, reason: "error" as const }));
        if (r.ok) {
          const a = element();
          a.src = `data:audio/mpeg;base64,${r.audio}`;
          try {
            await a.play();
            return await untilDone(a);
          } catch {
            /* refused — fall through to the browser's voice */
          }
        } else if (r.reason === "unavailable") {
          serverCanSpeak = false;
        }
      }
      return browserSay(body, language);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { prime, say, stop };
}

/**
 * Play a streamed source to its end. `false` = it failed BEFORE any sound (a
 * refused request, an unplayable answer) so the caller can try another way;
 * once it has played, an error mid-way just ends it, like a pause.
 */
async function playStream(a: HTMLAudioElement): Promise<boolean> {
  let started = false;
  const onPlaying = () => (started = true);
  a.addEventListener("playing", onPlaying);
  try {
    await a.play();
    await untilDone(a);
    return started || !a.error;
  } catch {
    return false;
  } finally {
    a.removeEventListener("playing", onPlaying);
  }
}

/** Resolves when the element stops: the end, a pause (stopped), or an error. */
function untilDone(a: HTMLAudioElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      a.removeEventListener("ended", done);
      a.removeEventListener("pause", done);
      a.removeEventListener("error", done);
      resolve();
    };
    a.addEventListener("ended", done);
    a.addEventListener("pause", done);
    a.addEventListener("error", done);
  });
}

function browserSay(text: string, language: "da" | "en"): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = language === "da" ? "da-DK" : "en-GB";
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(language));
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    } catch {
      resolve(); // no speech synthesis
    }
  });
}

/** 0.1 s of silence, 8 kHz mono WAV — the unlock blip. */
const SILENT_WAV = (() => {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  w(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, samples * 2, true);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${typeof btoa === "function" ? btoa(bin) : ""}`;
})();
