"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* -----------------------------------------------------------------------
 * Minimal Web Speech API surface — the standard `lib.dom.d.ts` doesn't
 * ship these types, and the polyfill names are vendor-prefixed in older
 * Safari. We declare just enough to avoid `any` while staying narrow.
 * -------------------------------------------------------------------- */

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* --------------------------------------------------------------------- */

export type DictateLanguage = "da-DK" | "en-US";

type Props = {
  /** Initial language. Defaults to da-DK; user can toggle per-session. */
  defaultLanguage?: DictateLanguage;
  /** Called when the user accepts a transcript. Append it to your state. */
  onAppend: (text: string) => void;
  /** Optional small label inside the trigger button. */
  label?: string;
  className?: string;
};

/**
 * Voice-to-text capture using the browser's Web Speech API. Lives next
 * to a textarea (or wherever the resulting text should land).
 *
 * Flow:
 *   1. Tap mic → starts listening. Button turns red.
 *   2. Live interim transcript appears beneath the button.
 *   3. Tap again to stop. Two buttons appear: Append / Discard.
 *   4. Append → `onAppend(finalTranscript)`; Discard → throws away.
 *
 * The parent owns the actual textarea state. We just hand back a string
 * via `onAppend` when the user confirms — parent decides how to merge it
 * (typically: existing text + "\n" + transcript, or replace if empty).
 *
 * Unsupported browsers (older Safari before iOS 14.5, Firefox) render a
 * disabled button with a tooltip pointing to the keyboard mic key.
 */
export function DictateButton({
  defaultLanguage = "da-DK",
  onAppend,
  label,
  className,
}: Props) {
  const [supported, setSupported] = useState(true);
  const [language, setLanguage] = useState<DictateLanguage>(defaultLanguage);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalChunksRef = useRef<string[]>([]);

  // Detect support on mount. Done in an effect (not lazy initial state) on
  // purpose: getSpeechRecognitionCtor() reads `window`, so it must run
  // client-only — initialising to `true` matches the server render and we
  // correct it after hydration, avoiding a mismatch. Some browsers also
  // lazy-define the constructor on first touch, so we check both names.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only detection, see above
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  function start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setErrorMessage(null);
    finalChunksRef.current = [];
    setInterim("");
    setPending(null);

    const r = new Ctor();
    r.lang = language;
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e) => {
      let interimText = "";
      // Walk only the new results — `resultIndex` marks where the
      // previous batch ended. Finalized chunks accumulate so a long
      // dictation survives partial-stop events.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        const chunk = res[0]?.transcript ?? "";
        if (res.isFinal) {
          finalChunksRef.current.push(chunk.trim());
        } else {
          interimText += chunk;
        }
      }
      setInterim(interimText.trim());
    };

    r.onerror = (e) => {
      // Map the Web Speech API's terse error codes to plain language a
      // technician can act on. "no-speech" / "aborted" are routine (nobody
      // talked, or we stopped/restarted) so we stay quiet on those.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setErrorMessage(
          "Microphone access was blocked. Check your browser permissions.",
        );
      } else if (e.error === "network") {
        // The browser couldn't reach its speech backend (Google's, on Chrome
        // desktop). Nothing app-side can fix the round-trip — point at the
        // reliable alternatives instead of showing raw "network".
        setErrorMessage(
          "Couldn't reach the browser's speech service. On a laptop this often fails — try again, type in the box above, or use your keyboard's mic key.",
        );
      } else if (e.error === "audio-capture") {
        setErrorMessage(
          "No microphone found. Plug one in, or type in the box above.",
        );
      } else if (e.error === "no-speech" || e.error === "aborted") {
        // ignore — common at the end of an utterance / on stop
      } else {
        setErrorMessage(e.message || `Speech error: ${e.error}`);
      }
    };

    r.onend = () => {
      setListening(false);
      // Stitch finalized chunks into one transcript and stage it for
      // confirmation. If nothing was captured we silently bail.
      const combined = finalChunksRef.current
        .filter((c) => c.length > 0)
        .join(" ")
        .trim();
      if (combined.length > 0) {
        setPending(combined);
      }
      setInterim("");
    };

    try {
      r.start();
      recRef.current = r;
      setListening(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not start the microphone.",
      );
    }
  }

  function stop() {
    // r.stop() flushes any in-flight final chunk via onresult before
    // firing onend. Don't null recRef yet — onend uses it.
    recRef.current?.stop();
  }

  function abort() {
    recRef.current?.abort();
    recRef.current = null;
    finalChunksRef.current = [];
    setInterim("");
    setListening(false);
  }

  // Tear down on unmount so we don't leave a hot mic when the tech
  // navigates away mid-dictation.
  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  function acceptPending() {
    if (pending) {
      onAppend(pending);
    }
    setPending(null);
    finalChunksRef.current = [];
  }

  function discardPending() {
    setPending(null);
    finalChunksRef.current = [];
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        {listening ? (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            onClick={stop}
            className="h-11 flex-1"
          >
            <Square className="size-4 fill-current" aria-hidden />
            Listening… tap to stop
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={start}
            disabled={!supported}
            className="h-11 flex-1"
          >
            <Mic className="size-4" aria-hidden />
            {label ?? "Dictate"}
          </Button>
        )}

        {/* Language toggle. Tiny chip; defaults to whichever language
            was passed in (typically work_orders.language). */}
        <button
          type="button"
          onClick={() =>
            setLanguage((l) => (l === "da-DK" ? "en-US" : "da-DK"))
          }
          disabled={listening}
          className={cn(
            "border-input hover:bg-muted shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-mono tabular-nums transition-colors",
            listening && "cursor-not-allowed opacity-50",
          )}
          aria-label={`Dictation language: ${language}. Tap to switch.`}
        >
          {language === "da-DK" ? "DA" : "EN"}
        </button>
      </div>

      {!supported ? (
        <p className="text-muted-foreground text-xs">
          Your browser doesn&rsquo;t support in-app dictation. Tap the mic
          key on your keyboard instead.
        </p>
      ) : null}

      {/* Live interim transcript — italic so the tech can see speech is
          being picked up. Disappears as soon as the chunk is finalized. */}
      {listening && interim ? (
        <p className="text-muted-foreground rounded-md bg-muted/40 px-3 py-2 text-sm italic">
          {interim}…
        </p>
      ) : null}

      {/* Confirmation step — never auto-append; the tech always sees
          what got captured and can throw it away if dictation went
          sideways. */}
      {pending ? (
        <div className="bg-muted/40 flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm">{pending}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={acceptPending}
              className="flex-1"
            >
              Append to notes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={discardPending}
            >
              <X className="size-4" aria-hidden /> Discard
            </Button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-destructive text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {listening ? (
        <button
          type="button"
          onClick={abort}
          className="text-muted-foreground hover:text-foreground self-start text-xs underline-offset-4 hover:underline"
        >
          Cancel without saving
        </button>
      ) : null}
    </div>
  );
}
