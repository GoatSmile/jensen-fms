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

  const say = useCallback(
    async (text: string, language: "da" | "en") => {
      const body = text.trim();
      if (!body) return;
      stop();
      if (serverCanSpeak) {
        const r = await speakAnswer(body, language).catch(() => ({ ok: false as const, reason: "error" as const }));
        if (r.ok) {
          const a = element();
          a.src = `data:audio/mpeg;base64,${r.audio}`;
          try {
            await a.play();
            return;
          } catch {
            /* refused — fall through to the browser's voice */
          }
        } else if (r.reason === "unavailable") {
          serverCanSpeak = false;
        }
      }
      browserSay(body, language);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { prime, say, stop };
}

function browserSay(text: string, language: "da" | "en") {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = language === "da" ? "da-DK" : "en-GB";
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(language));
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    /* no speech synthesis */
  }
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
