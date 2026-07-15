"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

import { saveBodyText, runExtraction } from "../../_actions/process";

type Props = {
  messageId: string;
  /** The saved `body_text`, or null until a transcript exists. */
  initialBody: string | null;
  /** Whether the selected extraction provider's secret is present. */
  extractionReady: boolean;
};

/**
 * Transcript stage of the harness. The textarea is the Slice-C ingress until
 * transcription (B) writes `body_text` for real — paste a Danish/English
 * transcript, Save it, then Run extraction. The extracted JSON lands in the
 * extraction editor below on refresh, ready for "Run matching".
 */
export function TranscriptPanel({
  messageId,
  initialBody,
  extractionReady,
}: Props) {
  const t = useTranslations("adminInbound");
  const router = useRouter();
  const [text, setText] = useState(initialBody ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [extractPending, startExtract] = useTransition();

  const hasSavedBody = (initialBody ?? "").trim().length > 0;

  function onSave() {
    setError(null);
    startSave(async () => {
      const r = await saveBodyText(messageId, text);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  function onExtract() {
    setError(null);
    startExtract(async () => {
      const r = await runExtraction(messageId);
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
          onClick={onSave}
          disabled={savePending}
        >
          <Save aria-hidden />
          {savePending ? t("saving") : t("saveTranscript")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onExtract}
          disabled={extractPending || !extractionReady || !hasSavedBody}
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
