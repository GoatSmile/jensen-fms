"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, Play, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  /** Time spent so far, in minutes (null = not recorded). Not money. */
  initialLaborMinutes: number | null;
  /** When the work started — seeds the "use elapsed" suggestion. */
  startedAt: string | null;
  /** Whether a transcription provider is configured — see lib/dictation/ready. */
  dictationReady: boolean;
  bikeId: string | null;
  /** Ticket number that finishing this WO will auto-resolve, else null. */
  resolvesTicketNumber: string | null;
  partRows: WOPartRow[];
  /** `costs` capability: false for technicians — no prices on the floor. */
  showMoney: boolean;
  photos: WOPhoto[];
};

export function Workspace({
  woId,
  status,
  language,
  initialDiagnosis,
  initialWorkPerformed,
  initialLaborMinutes,
  startedAt,
  dictationReady,
  resolvesTicketNumber,
  partRows,
  showMoney,
  photos,
}: Props) {
  const t = useTranslations("wo");
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis);
  const [workPerformed, setWorkPerformed] = useState(initialWorkPerformed);
  const [laborMinutes, setLaborMinutes] = useState<number | null>(
    initialLaborMinutes,
  );
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
    diagnosis !== initialDiagnosis ||
    workPerformed !== initialWorkPerformed ||
    laborMinutes !== initialLaborMinutes;
  const readOnly = status === "completed" || status === "cancelled";

  function buildSaveFormData(): FormData {
    const fd = new FormData();
    fd.set("diagnosis", diagnosis);
    fd.set("work_performed", workPerformed);
    fd.set("language", language);
    // Minutes only — never the rate or the billable flag: those are money,
    // and the action writes only the keys it is sent.
    fd.set("labor_minutes", laborMinutes == null ? "" : String(laborMinutes));
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
      await persistEdits();
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
          dictateReady={dictationReady}
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
          dictateReady={dictationReady}
          readOnly={readOnly}
        />

        <TimeSpentField
          id={`time-${woId}`}
          minutes={laborMinutes}
          onChange={setLaborMinutes}
          startedAt={status === "in_progress" ? startedAt : null}
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

        <PartsSection
          woId={woId}
          rows={partRows}
          readOnly={readOnly}
          showMoney={showMoney}
        />

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
                  {/* A nudge, not a gate: an order can be finished with no
                      time, but the office bills from this number. */}
                  <p className="text-center text-sm">
                    {laborMinutes == null || laborMinutes === 0 ? (
                      <span className="text-money font-medium">
                        {t("confirmFinishNoTime")}
                      </span>
                    ) : (
                      t("confirmFinishTime", {
                        time: formatMinutes(laborMinutes, t),
                      })
                    )}
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
  dictateReady: boolean;
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
  dictateReady,
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
            ready={dictateReady}
          />
          <p className="text-muted-foreground text-xs">{t("micTip")}</p>
        </>
      ) : null}
    </Panel>
  );
}

/** "1 t 20 min" / "45 min" — hours and minutes, via the message catalogue. */
function formatMinutes(
  total: number,
  t: ReturnType<typeof useTranslations<"wo">>,
): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return t("timeMinutes", { m });
  if (m === 0) return t("timeHours", { h });
  return t("timeHoursMinutes", { h, m });
}

/** Whole minutes since `iso`, never negative. */
function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/**
 * Time spent on the repair, as hours + minutes. Stored as whole minutes on
 * `work_orders.labor_minutes` — the office adds the rate; the floor never sees
 * it. Quick-add chips because a gloved thumb on a phone should not have to
 * type, and "use elapsed" because the Start button already stamped the clock.
 */
function TimeSpentField({
  id,
  minutes,
  onChange,
  startedAt,
  readOnly,
}: {
  id: string;
  minutes: number | null;
  onChange: (v: number | null) => void;
  /** Only while in progress — the suggestion is meaningless otherwise. */
  startedAt: string | null;
  readOnly: boolean;
}) {
  const t = useTranslations("wo");
  const hours = minutes == null ? "" : String(Math.floor(minutes / 60));
  const mins = minutes == null ? "" : String(minutes % 60);

  function setParts(hRaw: string, mRaw: string) {
    const h = hRaw.trim() === "" ? 0 : Math.floor(Number(hRaw));
    const m = mRaw.trim() === "" ? 0 : Math.floor(Number(mRaw));
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) return;
    if (hRaw.trim() === "" && mRaw.trim() === "") {
      onChange(null);
      return;
    }
    onChange(h * 60 + m);
  }

  const elapsed = startedAt ? minutesSince(startedAt) : null;

  return (
    <Panel
      className="border-l-[3px] border-l-brand"
      contentClassName="flex flex-col gap-2.5"
    >
      <div className="flex items-center gap-2">
        <Clock className="text-brand size-3.5" aria-hidden />
        <Label
          htmlFor={`${id}-h`}
          className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase"
        >
          {t("timeSpentLabel")}
        </Label>
      </div>
      {readOnly ? (
        <p className="text-sm">
          {minutes == null ? t("timeNotRecorded") : formatMinutes(minutes, t)}
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {t("timeSpentDescription")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Input
                id={`${id}-h`}
                inputMode="numeric"
                pattern="[0-9]*"
                className="h-11 w-16 text-center text-base tabular-nums"
                value={hours}
                onChange={(e) => setParts(e.target.value, mins)}
                aria-label={t("timeHoursAria")}
              />
              <span className="text-muted-foreground text-sm">
                {t("timeHoursUnit")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                id={`${id}-m`}
                inputMode="numeric"
                pattern="[0-9]*"
                className="h-11 w-16 text-center text-base tabular-nums"
                value={mins}
                onChange={(e) => setParts(hours, e.target.value)}
                aria-label={t("timeMinutesAria")}
              />
              <span className="text-muted-foreground text-sm">
                {t("timeMinutesUnit")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[15, 30, 60].map((add) => (
              <Button
                key={add}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChange((minutes ?? 0) + add)}
              >
                {add === 60 ? t("timeAddHour") : t("timeAddMinutes", { m: add })}
              </Button>
            ))}
            {elapsed != null && elapsed > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChange(elapsed)}
              >
                {t("timeUseElapsed", { time: formatMinutes(elapsed, t) })}
              </Button>
            ) : null}
            {minutes != null ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(null)}
              >
                {t("timeClear")}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}
