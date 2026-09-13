"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Mic, RotateCcw, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mintDictationUpload } from "@/app/_actions/dictation";
import {
  MAX_RECORD_SECONDS,
  recordingSupported,
  useRecorder,
} from "@/lib/dictation/use-recorder";
import { cn } from "@/lib/utils";

export type DictateLanguage = "da-DK" | "en-US";

type Props = {
  /** Initial language. Defaults to da-DK; user can toggle per-session. */
  defaultLanguage?: DictateLanguage;
  /** Called when the user accepts a transcript. Append it to your state. */
  onAppend: (text: string) => void;
  /** Optional small label inside the trigger button. */
  label?: string;
  /**
   * Whether a transcription provider is actually configured (server-resolved —
   * see src/lib/dictation/ready.ts). False disables the button with a reason
   * instead of letting the tech speak into something that cannot answer.
   */
  ready?: boolean;
  className?: string;
};

/**
 * What the BUTTON is doing. Recording is not in here on purpose — the recorder
 * hook already owns that state, and mirroring it into a second variable is how
 * the two drift apart.
 */
type Stage = "idle" | "transcribing" | "confirm";

/**
 * Voice-to-text: record here, transcribe on our server, confirm, append.
 *
 * REPLACED the Web Speech API on 2026-09-13. That API does no work locally on
 * desktop Chrome — it streams the audio to Google's servers — so it returned a
 * bare `network` error on every Chromium without Google's speech key (Electron
 * shells, in-app browsers, most Linux builds) and on anything behind a proxy
 * that blocks the endpoint. It failed for the owner on his own laptop with
 * nothing app-side to fix. getUserMedia + our own transcription provider has no
 * third party in the path and works in Firefox and Safari too.
 *
 * Flow:
 *   1. Tap mic → recording. Timer + level meter say the mic is live.
 *   2. Tap stop → the WAV uploads straight to storage, we transcribe it.
 *   3. The transcript is shown for confirmation — never auto-appended.
 *   4. Append → `onAppend(text)`; Discard → thrown away.
 *
 * The recording stays in memory until the tech accepts or discards, so a failed
 * transcription offers RETRY on the audio already captured. Losing what someone
 * just said is the one failure this component must not have.
 */
export function DictateButton({
  defaultLanguage = "da-DK",
  onAppend,
  label,
  ready = true,
  className,
}: Props) {
  const t = useTranslations("dictate");
  const [supported, setSupported] = useState(true);
  const [language, setLanguage] = useState<DictateLanguage>(defaultLanguage);
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Client-only detection, after hydration — initialising to `true` matches the
  // server render, so the button doesn't flicker from disabled to enabled.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setSupported(recordingSupported());
  }, []);

  const messageFor = useCallback(
    (reason: string) => {
      const key = `error_${reason}`;
      return t.has(key) ? t(key) : t("error_api_error");
    },
    [t],
  );

  /** Upload the captured WAV and ask the server for its text. */
  const transcribe = useCallback(
    async (blob: Blob) => {
      setStage("transcribing");
      setErrorMessage(null);
      try {
        const minted = await mintDictationUpload();
        if (!minted.ok) throw new Error(minted.error);

        const put = await fetch(minted.signedUrl, {
          method: "PUT",
          headers: { "content-type": "audio/wav" },
          body: blob,
        });
        if (!put.ok) throw new Error(`upload ${put.status}`);

        const res = await fetch("/api/dictate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: minted.path,
            language: language === "da-DK" ? "da" : "en",
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; text: string }
          | { ok: false; reason: string }
          | null;

        if (!json || !json.ok) {
          setErrorMessage(messageFor(json?.reason ?? "api_error"));
          setStage("confirm"); // keeps the audio, offers Retry
          return;
        }
        setTranscript(json.text);
        setStage("confirm");
      } catch {
        // Offline, storage refused, server unreachable — one message, and the
        // recording is still here.
        setErrorMessage(t("error_upload"));
        setStage("confirm");
      }
    },
    [language, messageFor, t],
  );

  // Transcription starts from the recorder's own callback — the one moment the
  // audio exists — so there is no effect watching for a blob to appear.
  const recorder = useRecorder({
    onCaptured: (blob) => void transcribe(blob),
  });

  async function startRecording() {
    setErrorMessage(null);
    setTranscript("");
    await recorder.start();
  }

  function accept() {
    if (transcript) onAppend(transcript);
    discard();
  }

  function discard() {
    recorder.reset();
    setTranscript("");
    setErrorMessage(null);
    setStage("idle");
  }

  function cancelRecording() {
    recorder.stop();
    discard();
  }

  const recording = recorder.phase === "recording";
  const disabled = !supported || !ready;
  // The recorder owns permission / empty-capture failures; showing its state
  // directly beats copying it into a second variable that can go stale.
  const shownError =
    errorMessage ?? (recorder.error ? t(`error_${recorder.error}`) : null);
  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        {recording ? (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            onClick={recorder.stop}
            className="h-11 flex-1"
          >
            <Square className="size-4 fill-current" aria-hidden />
            {t("listening")} {mmss(recorder.seconds)} / {mmss(MAX_RECORD_SECONDS)}
          </Button>
        ) : stage === "transcribing" ? (
          <Button type="button" size="lg" variant="outline" disabled className="h-11 flex-1">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("transcribing")}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={startRecording}
            disabled={disabled || stage === "confirm"}
            className="h-11 flex-1"
          >
            <Mic className="size-4" aria-hidden />
            {label ?? t("dictate")}
          </Button>
        )}

        {/* Language toggle. Pins the transcription language rather than letting
            detection guess — it is weakest on exactly the short phrases a tech
            dictates. Defaults to the surface's own language. */}
        <button
          type="button"
          onClick={() => setLanguage((l) => (l === "da-DK" ? "en-US" : "da-DK"))}
          disabled={recording || stage !== "idle"}
          className={cn(
            "border-input hover:bg-muted shrink-0 rounded-md border px-2.5 py-1.5 font-mono text-xs tabular-nums transition-colors",
            (recording || stage !== "idle") && "cursor-not-allowed opacity-50",
          )}
          aria-label={t("languageAria", { language })}
        >
          {language === "da-DK" ? "DA" : "EN"}
        </button>
      </div>

      {!supported ? (
        <p className="text-muted-foreground text-xs">{t("unsupported")}</p>
      ) : !ready ? (
        <p className="text-muted-foreground text-xs">{t("notConfigured")}</p>
      ) : null}

      {/* Level meter — the only sign the mic is live now that there is no
          interim transcript. A silent bar means a muted or wrong input. */}
      {recording ? (
        <div
          className="bg-ground h-1.5 w-full overflow-hidden rounded-full"
          role="presentation"
        >
          <div
            className="bg-destructive h-full rounded-full transition-[width] duration-100"
            style={{ width: `${Math.round(recorder.level * 100)}%` }}
          />
        </div>
      ) : null}

      {/* Confirmation — never auto-append; the tech always sees what was
          captured. On a failed transcription the same panel holds the audio
          and offers Retry, so nobody has to say it twice. */}
      {stage === "confirm" ? (
        <div className="bg-ground flex flex-col gap-2 rounded-md p-3">
          {transcript ? (
            <p className="text-sm">{transcript}</p>
          ) : (
            <p className="text-muted-foreground text-sm">{t("keptRecording")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {transcript ? (
              <Button type="button" size="sm" onClick={accept} className="flex-1">
                {t("append")}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => recorder.blob && transcribe(recorder.blob)}
                className="flex-1"
              >
                <RotateCcw className="size-4" aria-hidden /> {t("retry")}
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={discard}>
              <X className="size-4" aria-hidden /> {t("discard")}
            </Button>
          </div>
        </div>
      ) : null}

      {shownError ? (
        <p className="text-destructive text-xs" role="alert">
          {shownError}
        </p>
      ) : null}

      {recording ? (
        <button
          type="button"
          onClick={cancelRecording}
          className="text-muted-foreground hover:text-foreground self-start text-xs underline-offset-4 hover:underline"
        >
          {t("cancel")}
        </button>
      ) : null}
    </div>
  );
}
