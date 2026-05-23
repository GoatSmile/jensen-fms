"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Play, Save, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton, type DictateLanguage } from "@/components/dictate-button";
import {
  transitionWO,
  type WOTransitionResult,
} from "@/app/maintenance/work-orders/_actions/transition-wo";
import { updateWODetails } from "@/app/maintenance/work-orders/_actions/save-wo";
import type { WorkOrderStatus } from "@/lib/maintenance/work-order-status";

type Props = {
  woId: string;
  woNumber: string;
  status: WorkOrderStatus;
  language: "da" | "en";
  initialDiagnosis: string;
  initialWorkPerformed: string;
  bikeId: string | null;
};

/**
 * Client-side workspace. Wires the diagnosis + work-performed textareas
 * to in-app dictation, persists edits via updateWODetails, and exposes
 * the status transitions (Start / Mark done) in a bottom-fixed action
 * bar so techs can act without scrolling.
 *
 * Edits stay local until "Save" — keeps the network out of the typing
 * path. The bottom bar's Start/Done buttons auto-save first so a tech
 * never loses pending notes when transitioning state.
 */
export function Workspace({
  woId,
  status,
  language,
  initialDiagnosis,
  initialWorkPerformed,
}: Props) {
  const router = useRouter();
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis);
  const [workPerformed, setWorkPerformed] = useState(initialWorkPerformed);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    // is_billable is a checkbox sentinel — re-emit current truth so the
    // server action doesn't accidentally flip it. The technician
    // workspace doesn't surface this field; admin edits via the main
    // /maintenance/work-orders/[id] page when needed.
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
      // Auto-save pending edits first so a tech who typed notes then
      // tapped "Mark done" never loses work.
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
        <NotesField
          id={`diagnosis-${woId}`}
          label="Diagnosis"
          description="What's wrong with the bike?"
          value={diagnosis}
          onChange={setDiagnosis}
          dictateLang={defaultDictateLang}
          dictateLabel="Dictate diagnosis"
          readOnly={readOnly}
        />

        <NotesField
          id={`work-${woId}`}
          label="Work performed"
          description="What did you do? Parts replaced, adjustments, observations."
          value={workPerformed}
          onChange={setWorkPerformed}
          dictateLang={defaultDictateLang}
          dictateLabel="Dictate work performed"
          readOnly={readOnly}
        />

        {/* Save row — surfaces "dirty" state so the tech sees that
            their notes aren't committed yet. */}
        {!readOnly ? (
          <div className="bg-card flex items-center justify-between gap-2 rounded-md border p-3">
            <span className="text-muted-foreground text-xs">
              {dirty
                ? "Unsaved changes"
                : savedAt
                  ? `Saved · ${new Date(savedAt).toLocaleTimeString("da-DK")}`
                  : "Up to date"}
            </span>
            <Button
              type="button"
              size="sm"
              variant={dirty ? "default" : "outline"}
              onClick={onSave}
              disabled={!dirty || saving}
            >
              <Save className="size-4" aria-hidden />
              {saving ? "Saving…" : "Save notes"}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p
            className="bg-destructive/10 text-destructive border-destructive/30 rounded-md border p-3 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {readOnly ? (
          <div className="bg-muted/40 text-muted-foreground rounded-md border p-3 text-xs">
            This work order is {status}. Notes are read-only — re-open via
            the desktop view if you need to edit.
          </div>
        ) : null}
      </div>

      {/* Bottom-fixed status action bar. Always reachable on mobile
          without scrolling. Status-aware: shows Start when open,
          Mark done when in_progress, hides itself when terminal. */}
      {!readOnly ? (
        <div className="bg-background fixed inset-x-0 bottom-0 z-20 border-t p-3 sm:p-4">
          <div className="mx-auto flex w-full max-w-2xl gap-2">
            {status === "open" ? (
              <Button
                type="button"
                size="lg"
                onClick={() => onTransition("in_progress")}
                disabled={transitioning}
                className="h-12 flex-1 text-base"
              >
                <Play className="size-5" aria-hidden />
                {transitioning ? "Starting…" : "Start work"}
              </Button>
            ) : null}
            {status === "in_progress" ? (
              <Button
                type="button"
                size="lg"
                onClick={() => onTransition("completed")}
                disabled={transitioning}
                className="h-12 flex-1 bg-emerald-600 text-base text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="size-5" aria-hidden />
                {transitioning ? "Saving…" : "Mark done"}
              </Button>
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
  value,
  onChange,
  dictateLang,
  dictateLabel,
  readOnly,
}: FieldProps) {
  function appendDictated(text: string) {
    // Add a space separator if the existing notes don't already end with
    // whitespace, so multiple dictation passes read naturally.
    const sep = value.length === 0 || /\s$/.test(value) ? "" : " ";
    onChange(`${value}${sep}${text}`);
  }

  return (
    <section className="bg-card flex flex-col gap-2.5 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <Wrench className="text-muted-foreground size-4" aria-hidden />
        <Label htmlFor={id} className="text-sm font-semibold">
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
        placeholder={
          readOnly ? undefined : "Type, or tap Dictate / your keyboard's mic key."
        }
        className="font-sans text-sm"
      />
      {!readOnly ? (
        <>
          <DictateButton
            defaultLanguage={dictateLang}
            onAppend={appendDictated}
            label={dictateLabel}
          />
          <p className="text-muted-foreground text-xs">
            💡 Tip: the mic key on your phone&rsquo;s keyboard also works.
          </p>
        </>
      ) : null}
    </section>
  );
}
