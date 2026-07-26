"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Play, Save, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatchCandidates } from "@/lib/inbound/match";

import { runMatch, saveExtraction } from "../../_actions/process";

type Props = {
  messageId: string;
  initialExtractionJson: string;
  hasExtraction: boolean;
  matchCandidates: MatchCandidates | null;
  matchedOrganizationId: string | null;
  matchedContactId: string | null;
  matchedBikeId: string | null;
};

const TEMPLATE = `{
  "organizationName": "",
  "callbackNumber": "",
  "frameNumber": "",
  "fleetNumber": "",
  "colorHint": "",
  "bikeTypeHint": "",
  "problem": "",
  "urgency": "normal",
  "intent": "repair_request"
}`;

export function MatchPanel({
  messageId,
  initialExtractionJson,
  hasExtraction,
  matchCandidates,
  matchedOrganizationId,
  matchedContactId,
  matchedBikeId,
}: Props) {
  const t = useTranslations("inbox");
  const router = useRouter();
  const [text, setText] = useState(initialExtractionJson || TEMPLATE);
  // Re-sync the editor when a fresh extraction arrives from the server (e.g.
  // after Run extraction in the transcript panel), without clobbering local
  // hand-edits on unrelated refreshes.
  const prevInitial = useRef(initialExtractionJson);
  useEffect(() => {
    if (initialExtractionJson && initialExtractionJson !== prevInitial.current) {
      setText(initialExtractionJson);
    }
    prevInitial.current = initialExtractionJson;
  }, [initialExtractionJson]);
  const [error, setError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [matchPending, startMatch] = useTransition();

  function onSave() {
    setError(null);
    startSave(async () => {
      const r = await saveExtraction(messageId, text);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  function onMatch() {
    setError(null);
    startMatch(async () => {
      const r = await runMatch(messageId);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  const orgs = matchCandidates?.organizations ?? [];
  const contacts = matchCandidates?.contacts ?? [];
  const bikes = matchCandidates?.bikes ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Extraction editor — harness ingress until Slice C writes this. */}
      <section className="flex flex-col gap-2 rounded-md border p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{t("extractionTitle")}</h2>
          <p className="text-muted-foreground text-xs">
            {t("extractionHarnessHint")}
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={10}
          className="border-input bg-muted/30 w-full rounded-md border p-3 font-mono text-xs"
        />
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSave}
            disabled={savePending}
          >
            <Save aria-hidden />
            {savePending ? t("saving") : t("saveExtraction")}
          </Button>
        </div>
      </section>

      {/* Match */}
      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("matchTitle")}</h2>
          <Button
            type="button"
            size="sm"
            onClick={onMatch}
            disabled={matchPending || !hasExtraction}
          >
            <Play aria-hidden />
            {matchPending ? t("matching") : t("runMatch")}
          </Button>
        </div>

        {!hasExtraction ? (
          <p className="text-muted-foreground text-sm italic">
            {t("matchNeedsExtraction")}
          </p>
        ) : !matchCandidates ? (
          <p className="text-muted-foreground text-sm italic">
            {t("matchNotRun")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <CandidateGroup
              label={t("candOrganizations")}
              icon={<Users className="size-3.5" aria-hidden />}
              rows={orgs.map((o) => ({
                id: o.id,
                primary: o.name,
                meta: t(`via_${o.via}`),
              }))}
              matchedId={matchedOrganizationId}
              attachedText={t("attached")}
              reviewText={t("needsReview")}
              noneText={t("noCandidates")}
            />
            <CandidateGroup
              label={t("candContacts")}
              rows={contacts.map((c) => ({
                id: c.id,
                primary: c.name,
                meta: c.phone ?? "",
              }))}
              matchedId={matchedContactId}
              attachedText={t("attached")}
              reviewText={t("needsReview")}
              noneText={t("noCandidates")}
            />
            <CandidateGroup
              label={t("candBikes")}
              rows={bikes.map((b) => ({
                id: b.id,
                primary: b.frameNumber,
                meta: t(`via_${b.via}`),
              }))}
              matchedId={matchedBikeId}
              attachedText={t("attached")}
              reviewText={t("needsReview")}
              noneText={t("noCandidates")}
            />
            {matchCandidates.notes.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                {matchCandidates.notes.map((n) => t(`note_${n}`)).join(" · ")}
              </p>
            ) : null}
          </div>
        )}
      </section>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CandidateGroup({
  label,
  icon,
  rows,
  matchedId,
  attachedText,
  reviewText,
  noneText,
}: {
  label: string;
  icon?: React.ReactNode;
  rows: { id: string; primary: string; meta: string }[];
  matchedId: string | null;
  attachedText: string;
  reviewText: string;
  noneText: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground flex items-center gap-1 text-xs tracking-wide uppercase">
          {icon}
          {label}
        </span>
        {rows.length === 0 ? (
          <span className="text-muted-foreground text-xs">— {noneText}</span>
        ) : matchedId ? (
          <span className="inline-flex items-center gap-1 text-xs text-good">
            <Check className="size-3.5" aria-hidden />
            {attachedText}
          </span>
        ) : (
          <span className="text-xs text-money">
            {reviewText} ({rows.length})
          </span>
        )}
      </div>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-sm",
                r.id === matchedId
                  ? "bg-good-wash"
                  : "bg-background",
              )}
            >
              <span className="font-medium">{r.primary}</span>
              {r.meta ? (
                <span className="text-muted-foreground text-xs">{r.meta}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
