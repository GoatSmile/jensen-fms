"use client";

/**
 * Microphone capture for dictation — Web Audio API in, 16-bit 16 kHz mono WAV
 * out, no dependencies.
 *
 * WHY NOT MediaRecorder: it emits `audio/webm;codecs=opus` on Chromium and
 * `audio/mp4` on Safari, so the provider would see two formats and the client
 * would need mime negotiation. WAV at 16 kHz mono is one format everywhere and
 * is what every ASR engine resamples to anyway. Ported from Munin's
 * SurpriseRecorder, which has run this encoder in production since 2026-08.
 *
 * WHY NOT the Web Speech API, which this replaced: on desktop Chrome it streams
 * audio to Google's servers, so it fails with a bare `network` error on any
 * Chromium without Google's API key — Electron shells, in-app browsers, most
 * Linux builds — and failed for the owner on his own laptop (2026-09-13).
 * getUserMedia has none of that: no third party between the mic and the blob.
 *
 * `ScriptProcessorNode` is formally deprecated in favour of `AudioWorklet`, but
 * no browser has removed it or announced a date, and a worklet needs a
 * separately-served module file. Parked in BACKLOG as a swap to make if it bites.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough for a diagnosis, short enough that a stuck recording is cheap. */
export const MAX_RECORD_SECONDS = 180;

/** What ASR wants; also ~8× smaller than the browser's native 48 kHz. */
const TARGET_SAMPLE_RATE = 16_000;

export type RecorderPhase = "idle" | "recording" | "captured";

export type RecorderErrorCode = "unsupported" | "permission" | "empty";

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function recordingSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia) && getAudioContextCtor() !== null;
}

/**
 * Interleaved mono PCM → a RIFF/WAVE blob. The sample rate is READ BACK from
 * the context rather than assumed: Safari has historically ignored the
 * constructor's rate hint, and a header that lies about it plays (and
 * transcribes) at the wrong pitch.
 */
function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, length * 2, true);
  let off = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i] ?? 0));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export type Recorder = {
  phase: RecorderPhase;
  /** Whole seconds elapsed while recording. */
  seconds: number;
  /** 0..1 RMS of the last buffer — the "we can hear you" signal. */
  level: number;
  /** The captured WAV, once `phase` is "captured". Survives a failed upload. */
  blob: Blob | null;
  error: RecorderErrorCode | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Throw the capture away and return to idle. */
  reset: () => void;
};

export type RecorderOptions = {
  /**
   * Called once with the encoded WAV, from whichever path ended the recording
   * — the tech's Stop or the auto-stop at `maxSeconds`. A callback rather than
   * a `blob` the caller watches in an effect: there is exactly one moment the
   * audio becomes available, and an effect turns that moment into a state
   * comparison that has to re-derive it.
   */
  onCaptured?: (blob: Blob) => void;
  maxSeconds?: number;
};

export function useRecorder({
  onCaptured,
  maxSeconds = MAX_RECORD_SECONDS,
}: RecorderOptions = {}): Recorder {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<RecorderErrorCode | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // stop() is referenced by the interval and by unmount before it is defined,
  // so it rides in a ref rather than being re-created as a dependency.
  const stopRef = useRef<() => void>(() => {});
  // Same for the caller's callback: keeping it in a ref means a caller that
  // passes an inline arrow doesn't rebuild stop() on every render.
  const onCapturedRef = useRef(onCaptured);
  useEffect(() => {
    onCapturedRef.current = onCaptured;
  }, [onCaptured]);

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    // Read the rate off the live context BEFORE closing it — see encodeWav.
    const sampleRate = ctxRef.current?.sampleRate ?? TARGET_SAMPLE_RATE;
    teardown();
    const captured = chunksRef.current;
    chunksRef.current = [];
    const total = captured.reduce((n, c) => n + c.length, 0);
    if (total === 0) {
      setPhase("idle");
      setError("empty");
      return;
    }
    const wav = encodeWav(captured, sampleRate);
    setBlob(wav);
    setPhase("captured");
    onCapturedRef.current?.(wav);
  }, [teardown]);

  // The auto-stop interval closes over this; keep the ref pointing at the
  // current closure without touching it during render.
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!recordingSupported()) {
      setError("unsupported");
      return;
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      setError("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      // Denied, dismissed, or no device — all one message to the tech, who can
      // act on exactly one of them (check the permission).
      setError("permission");
      return;
    }

    const ctx = new Ctor({ sampleRate: TARGET_SAMPLE_RATE });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    chunksRef.current = [];
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      chunksRef.current.push(new Float32Array(input));
      // RMS off the buffer we already have — a level meter for free, and the
      // only feedback that the mic is live now that there is no interim text.
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += (input[i] ?? 0) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / input.length) * 4));
    };
    source.connect(processor);
    // Chrome only fires onaudioprocess on a connected node. Nothing is ever
    // written to outputBuffer, so what reaches the speakers is silence — this
    // is not a feedback loop.
    processor.connect(ctx.destination);

    ctxRef.current = ctx;
    streamRef.current = stream;
    setSeconds(0);
    setBlob(null);
    setPhase("recording");

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= maxSeconds) stopRef.current();
    }, 250);
  }, [maxSeconds]);

  const reset = useCallback(() => {
    setBlob(null);
    setError(null);
    setSeconds(0);
    setPhase("idle");
  }, []);

  // Never leave a hot mic when the tech navigates away mid-dictation.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return { phase, seconds, level, blob, error, start, stop, reset };
}
