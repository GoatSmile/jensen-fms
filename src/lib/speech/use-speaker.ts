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

/** How the reply was voiced — kept with the turn's timings. */
export type Voice = "stream" | "file" | "browser" | "sentences";

/** A reply spoken SENTENCE BY SENTENCE while it is still being written. */
export type SentenceQueue = {
  /** One more finished sentence: its audio is fetched now, played in turn. */
  add: (sentence: string) => void;
  /** No more sentences: resolves when the last one has FINISHED playing. */
  end: () => Promise<void>;
  /** `performance.now()` of the first sound, once there was one. */
  firstSoundAt: () => number | null;
};

export function useSpeaker() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const element = () => (audioRef.current ??= new Audio());
  /** Bumped by stop(): a queue from before it stops playing. */
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current++;
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
    async (
      text: string,
      language: "da" | "en",
      opts: { messageId?: string; onStart?: (voice: Voice) => void } = {},
    ): Promise<void> => {
      const body = text.trim();
      if (!body) return;
      stop();
      if (serverCanSpeak && opts.messageId) {
        const a = element();
        a.src = `/api/speak?m=${encodeURIComponent(opts.messageId)}&lang=${language}`;
        if (await playStream(a, () => opts.onStart?.("stream"))) return;
      }
      if (serverCanSpeak) {
        const r = await speakAnswer(body, language).catch(() => ({ ok: false as const, reason: "error" as const }));
        if (r.ok) {
          const a = element();
          a.src = `data:audio/mpeg;base64,${r.audio}`;
          try {
            await a.play();
            opts.onStart?.("file");
            return await untilDone(a);
          } catch {
            /* refused — fall through to the browser's voice */
          }
        } else if (r.reason === "unavailable") {
          serverCanSpeak = false;
        }
      }
      return browserSay(body, language, () => opts.onStart?.("browser"));
    },
    [stop],
  );

  /**
   * Speak a reply as it is WRITTEN (2026-10-22): each sentence's audio is
   * fetched the moment the sentence arrives (/api/speak POST — parallel, so
   * the next is ready while one plays) and played in order on the primed
   * element; a sentence the server cannot voice is read by the browser. The
   * person hears the first sentence about a second before the answer is
   * complete. stop() ends it.
   */
  const queue = useCallback((language: "da" | "en"): SentenceQueue => {
    const mine = generation.current;
    const pending: { text: string; audio: Promise<string | null> }[] = [];
    let ended = false;
    let wake: (() => void) | null = null;
    let first: number | null = null;
    const live = () => generation.current === mine;
    const fetchAudio = async (text: string): Promise<string | null> => {
      if (!serverCanSpeak) return null;
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, lang: language }),
        });
        if (res.status === 503) serverCanSpeak = false;
        if (!res.ok) return null;
        return URL.createObjectURL(await res.blob());
      } catch {
        return null;
      }
    };
    const heard = () => {
      first ??= performance.now();
    };
    const done = (async () => {
      for (let i = 0; ; i++) {
        while (i >= pending.length && !ended) await new Promise<void>((r) => (wake = r));
        if (i >= pending.length || !live()) break;
        const item = pending[i];
        const url = await item.audio;
        if (!live()) {
          if (url) URL.revokeObjectURL(url);
          break;
        }
        let played = false;
        if (url) {
          const a = element();
          a.src = url;
          try {
            await a.play();
            heard();
            played = true;
            await untilDone(a);
          } catch {
            /* refused — the browser's voice below */
          }
          URL.revokeObjectURL(url);
        }
        if (!played && live()) await browserSay(item.text, language, heard);
      }
    })();
    return {
      add: (sentence) => {
        const text = sentence.trim();
        if (!text || ended) return;
        pending.push({ text, audio: fetchAudio(text) });
        wake?.();
      },
      end: () => {
        ended = true;
        wake?.();
        return done;
      },
      firstSoundAt: () => first,
    };
  }, []);

  useEffect(() => stop, [stop]);

  return { prime, say, stop, queue };
}

/**
 * Play a streamed source to its end. `false` = it failed BEFORE any sound (a
 * refused request, an unplayable answer) so the caller can try another way;
 * once it has played, an error mid-way just ends it, like a pause.
 */
async function playStream(a: HTMLAudioElement, onStart: () => void): Promise<boolean> {
  let started = false;
  const onPlaying = () => {
    if (!started) onStart();
    started = true;
  };
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

function browserSay(text: string, language: "da" | "en", onStart: () => void): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = language === "da" ? "da-DK" : "en-GB";
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(language));
      if (voice) u.voice = voice;
      u.onstart = () => onStart();
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
