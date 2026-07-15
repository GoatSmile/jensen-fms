"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AudioLines, Play, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  runExtraction,
  runPipeline,
  runTranscription,
  saveBodyText,
} from "../../_actions/process";

type Props = {
  messageId: string;
  /** The saved `body_text`, or null until a transcript exists. */
  initialBody: string | null;
  /** Whether a recording is attached (media_path present). */
  hasAudio: boolean;
  /** Whether the selected transcription provider's secret is present. */
  transcriptionReady: boolean;
  /** Whether the selected extraction provider's secret is present. */
  extractionReady: boolean;
};

/**
 * Transcript stage of the harness. With a recording attached, "Transcribe
 * recording" runs the selected provider (Slice B) and "Run whole pipeline"
 * chains transcribe → extract → match in one click. The textarea stays as
 * the hand-typed ingress (and debugging override once transcription is
 * live): paste a transcript, Save it, then Run extraction.
 */
export function TranscriptPanel({
  messageId,
  initialBody,
  hasAudio,
  transcriptionReady,
  extractionReady,
}: Props) {
  const t = useTranslations("adminInbound");
  const router = useRouter();
  const [text, setText] = useState(initialBody ?? "");
  // Re-sync the editor when a fresh transcript arrives from the server
  // (after Transcribe / Run pipeline), without clobbering local edits on
  // unrelated refreshes.
  const prevInitial = useRef(initialBody);
  useEffect(() => {
    if (initialBody && initialBody !== prevInitial.current) {
      setText(initialBody);
    }
    prevInitial.current = initialBody;
  }, [initialBody]);
  const [error, setError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [extractPending, startExtract] = useTransition();
  const [transcribePending, startTranscribe] = useTransition();
  const [pipelinePending, startPipeline] = useTransition();

  const hasSavedBody = (initialBody ?? "").trim().length > 0;
  const anyPending =
    savePending || extractPending || transcribePending || pipelinePending;

  function run(
    start: typeof startSave,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{t("stageTranscript")}</h2>
        <p className="text-muted-foreground text-xs">
          {t("transcriptHarnessHint")}
        </p>
      </div>

      {/* The real path: transcribe the recording / run everything at once. */}
      {hasAudio ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => run(startTranscribe, () => runTranscription(messageId))}
            disabled={anyPending || !transcriptionReady}
          >
            <AudioLines aria-hidden />
            {transcribePending ? t("transcribing") : t("transcribeButton")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => run(startPipeline, () => runPipeline(messageId))}
            disabled={anyPending || !transcriptionReady || !extractionReady}
          >
            <Play aria-hidden />
            {pipelinePending ? t("pipelineRunning") : t("runPipeline")}
          </Button>
          {!transcriptionReady ? (
            <span className="text-muted-foreground text-xs">
              {t("transcriptionKeyMissingHint")}
            </span>
          ) : !extractionReady ? (
            <span className="text-muted-foreground text-xs">
              {t("extractionKeyMissingHint")}
            </span>
          ) : null}
        </div>
      ) : null}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={t("transcriptPlaceholder")}
        className="border-input bg-muted/30 w-full rounded-md border p-3 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => run(startSave, () => saveBodyText(messageId, text))}
          disabled={anyPending}
        >
          <Save aria-hidden />
          {savePending ? t("saving") : t("saveTranscript")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={hasAudio ? "outline" : "default"}
          onClick={() => run(startExtract, () => runExtraction(messageId))}
          disabled={anyPending || !extractionReady || !hasSavedBody}
        >
          <Sparkles aria-hidden />
          {extractPending ? t("extracting") : t("runExtraction")}
        </Button>
        {!extractionReady ? (
          <span className="text-muted-foreground text-xs">
            {t("extractionKeyMissingHint")}
          </span>
        ) : !hasSavedBody ? (
          <span className="text-muted-foreground text-xs">
            {t("extractionNeedsBody")}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
