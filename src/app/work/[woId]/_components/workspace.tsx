"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Play, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton, type DictateLanguage } from "@/components/dictate-button";
import {
  transitionWO,
  type WOTransitionResult,
} from "@/app/maintenance/work-orders/_actions/transition-wo";
import { updateWODetails } from "@/app/maintenance/work-orders/_actions/save-wo";
import { appendTimestamped } from "@/lib/notes/append";
import type { WorkOrderStatus } from "@/lib/maintenance/work-order-status";

import {
  PartsSection,
  type WOPartRow,
} from "./parts-section";
import {
  PhotosSection,
  type WOPhoto,
} from "./photos-section";

type Props = {
  woId: string;
  woNumber: string;
  status: WorkOrderStatus;
  language: "da" | "en";
  initialDiagnosis: string;
  initialWorkPerformed: string;
  bikeId: string | null;
  /** Ticket number that finishing this WO will auto-resolve, else null. */
  resolvesTicketNumber: string | null;
  partRows: WOPartRow[];
  photos: WOPhoto[];
};

export function Workspace({
  woId,
  status,
  language,
  initialDiagnosis,
  initialWorkPerformed,
  resolvesTicketNumber,
  partRows,
  photos,
}: Props) {
  const t = useTranslations("wo");
  const router = useRouter();
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis);
  const [workPerformed, setWorkPerformed] = useState(initialWorkPerformed);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Mark done" is terminal + auto-resolves the linked ticket, so it arms a
  // confirm step (naming the ticket consequence) rather than firing on the
  // first tap — the highest-stakes floor action shouldn't be the twitchiest.
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [saving, startSaving] = useTransition();
  const [transitioning, startTransitioning] = useTransition();

  const defaultDictateLang: DictateLanguage =
    language === "en" ? "en-US" : "da-DK";

  const dirty =
    diagnosis !== initialDiagnosis || workPerformed !== initialWorkPerformed;
  const readOnly = status === "completed" || status === "cancelled";

  function buildSaveFormData(): FormData {
    const fd = new FormData();
    fd.set("diagnosis", diagnosis);
    fd.set("work_performed", workPerformed);
    fd.set("language", language);
    fd.set("is_billable", "true");
    return fd;
  }

  async function persistEdits(): Promise<boolean> {
    const r = await updateWODetails(woId, buildSaveFormData());
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    setError(null);
    setSavedAt(new Date().toISOString());
    return true;
  }

  function onSave() {
    setError(null);
    startSaving(async () => {
      const ok = await persistEdits();
      if (ok) router.refresh();
    });
  }

  function onTransition(toStatus: WorkOrderStatus) {
    setError(null);
    startTransitioning(async () => {
      if (dirty && !readOnly) {
        const ok = await persistEdits();
        if (!ok) return;
      }
      const result: WOTransitionResult = await transitionWO(
        woId,
        toStatus,
        null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-5">
        {/* Diagnosis — the problem. `money` is the caution hue (ochre): red is
            reserved for genuine alarm, and a bike needing diagnosis is normal
            work, not an alarm. Matches the icon, which was already text-money. */}
        <NotesField
          id={`diagnosis-${woId}`}
          label={t("diagnosisLabel")}
          description={t("diagnosisDescription")}
          icon={<AlertTriangle className="size-3.5 text-money" aria-hidden />}
          accentClass="border-l-[3px] border-l-money"
          value={diagnosis}
          onChange={setDiagnosis}
          dictateLang={defaultDictateLang}
          dictateLabel={t("diagnosisDictate")}
          readOnly={readOnly}
        />

        {/* Work performed — the solution. `good` = done. Matches the icon. */}
        <NotesField
          id={`work-${woId}`}
          label={t("workPerformedLabel")}
          description={t("workPerformedDescription")}
          icon={<CheckCircle2 className="size-3.5 text-good" aria-hidden />}
          accentClass="border-l-[3px] border-l-good"
          value={workPerformed}
          onChange={setWorkPerformed}
          dictateLang={defaultDictateLang}
          dictateLabel={t("workPerformedDictate")}
          readOnly={readOnly}
        />

        {/* Save row — surfaces "dirty" state so the tech sees that
            their notes aren't committed yet. */}
        {!readOnly ? (
          <div className="bg-surface flex items-center justify-between gap-2 rounded-lg p-3">
            <span className="text-muted-foreground text-xs">
              {dirty
                ? t("unsavedChanges")
                : savedAt
                  ? t("savedAt", {
                      time: new Date(savedAt).toLocaleTimeString("da-DK"),
                    })
                  : t("upToDate")}
            </span>
            <Button
              type="button"
              size="sm"
              variant={dirty ? "default" : "outline"}
              onClick={onSave}
              disabled={!dirty || saving}
            >
              <Save className="size-4" aria-hidden />
              {saving ? t("saving") : t("saveNotes")}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p
            className="bg-alert-wash text-alert rounded-lg p-3 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {/* bg-surface, NOT bg-ground: this sits at page level, where the page
            background already IS --ground, so a ground fill renders as nothing
            and the notice reads as floating text (CLAUDE.md). */}
        {readOnly ? (
          <div className="bg-surface text-ink-2 rounded-lg p-3 text-xs">
            {t("readOnlyNote", {
              status: t(`status.${status}`).toLowerCase(),
            })}
          </div>
        ) : null}

        <PartsSection woId={woId} rows={partRows} readOnly={readOnly} />

        <PhotosSection woId={woId} photos={photos} readOnly={readOnly} />
      </div>

      {/* Bottom-fixed status action bar. h-14 so a tech with gloves
          (or one-handed) hits it reliably. Status-aware: Start when
          open, Mark done when in_progress, hidden when terminal. */}
      {!readOnly ? (
        <div className="bg-background fixed inset-x-0 bottom-0 z-20 border-t p-3 sm:p-4">
          <div className="mx-auto flex w-full max-w-2xl gap-2">
            {status === "open" ? (
              <Button
                type="button"
                size="lg"
                onClick={() => onTransition("in_progress")}
                disabled={transitioning}
                className="h-14 flex-1 bg-brand text-on-brand text-base font-semibold hover:bg-brand"
              >
                <Play className="size-5" aria-hidden />
                {transitioning ? t("starting") : t("startWork")}
              </Button>
            ) : null}
            {status === "in_progress" ? (
              confirmingComplete ? (
                <div className="flex w-full flex-col gap-2">
                  <p className="text-center text-sm font-medium">
                    {resolvesTicketNumber
                      ? t("confirmFinishResolves", {
                          ticket: resolvesTicketNumber,
                        })
                      : t("confirmFinishIrreversible")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      onClick={() => setConfirmingComplete(false)}
                      disabled={transitioning}
                      className="h-14 flex-1 text-base"
                    >
                      {t("cancelFinish")}
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => onTransition("completed")}
                      disabled={transitioning}
                      className="h-14 flex-1 bg-good text-on-good text-base font-semibold hover:bg-good"
                    >
                      <CheckCircle2 className="size-5" aria-hidden />
                      {transitioning ? t("completing") : t("confirmFinish")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  onClick={() => setConfirmingComplete(true)}
                  disabled={transitioning}
                  className="h-14 flex-1 bg-good text-on-good text-base font-semibold hover:bg-good"
                >
                  <CheckCircle2 className="size-5" aria-hidden />
                  {t("markDone")}
                </Button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

type FieldProps = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  accentClass: string;
  value: string;
  onChange: (v: string) => void;
  dictateLang: DictateLanguage;
  dictateLabel: string;
  readOnly: boolean;
};

function NotesField({
  id,
  label,
  description,
  icon,
  accentClass,
  value,
  onChange,
  dictateLang,
  dictateLabel,
  readOnly,
}: FieldProps) {
  const t = useTranslations("wo");
  function appendDictated(text: string) {
    // Each dictation pass becomes its own timestamped block, so the
    // tech ends up with a chronological log instead of one smeared
    // paragraph. Format produced by appendTimestamped:
    //
    //     prior content
    //
    //     [2026-05-23 14:52]
    //     freshly dictated text
    onChange(appendTimestamped(value, text));
  }

  return (
    <Panel className={accentClass} contentClassName="flex flex-col gap-2.5">
      {/*
        The title is deliberately NOT Panel's `title` prop: that renders an
        <h2>, and this section's title is the textarea's own <Label htmlFor>.
        Losing that association would cost the tech the tap-the-label-to-focus
        target on a phone, so the Label stays and wears the eyebrow's classes
        by hand. The hue lives in the accent bar only — colouring the label too
        would double it, and colour is meaningful only while it's scarce.
      */}
      <div className="flex items-center gap-2">
        {icon}
        <Label
          htmlFor={id}
          className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase"
        >
          {label}
        </Label>
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
      <Textarea
        id={id}
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={readOnly ? undefined : t("notesPlaceholder")}
        className="font-sans text-sm"
      />
      {!readOnly ? (
        <>
          <DictateButton
            defaultLanguage={dictateLang}
            onAppend={appendDictated}
            label={dictateLabel}
          />
          <p className="text-muted-foreground text-xs">{t("micTip")}</p>
        </>
      ) : null}
    </Panel>
  );
}
