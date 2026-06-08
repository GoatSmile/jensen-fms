"use client";

import { useRouter } from "next/navigation";
import { Field, ReadField } from "@/components/field";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";

import { updateWODetails } from "../../_actions/save-wo";
import { Section } from "./section";

const DEFAULT_LABOR_RATE_DKK = 600;

export type WODetailsValues = {
  diagnosis: string;
  work_performed: string;
  customer_summary_en: string;
  customer_summary_da: string;
  language: string; // "da" | "en"
  labor_minutes: string; // numeric or ""
  labor_rate_dkk: string; // numeric or ""
  is_billable: boolean;
};

type Props = {
  woId: string;
  initial: WODetailsValues;
  readOnly: boolean;
};

export function WODetailsSection({ woId, initial, readOnly }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<WODetailsValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function update<K extends keyof WODetailsValues>(
    key: K,
    value: WODetailsValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "diagnosis", values.diagnosis);
    appendField(fd, "work_performed", values.work_performed);
    appendField(fd, "customer_summary_en", values.customer_summary_en);
    appendField(fd, "customer_summary_da", values.customer_summary_da);
    appendField(fd, "language", values.language);
    appendField(fd, "labor_minutes", values.labor_minutes);
    appendField(fd, "labor_rate_dkk", values.labor_rate_dkk);
    // Always emit a definitive boolean — see updateWODetails for the parser.
    appendField(fd, "is_billable", values.is_billable ? "true" : "false");
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    start(async () => {
      const fd = buildFormData();
      const r = await updateWODetails(woId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("Saved.");
      router.refresh();
    });
  }

  if (readOnly) {
    return (
      <Section
        title="Details"
        description="Read-only — this work order is closed."
      >
        <dl className="flex flex-col gap-3">
          <ReadField label="Diagnosis" value={initial.diagnosis} multiline />
          <ReadField
            label="Work performed"
            value={initial.work_performed}
            multiline
          />
          <ReadField
            label="Customer summary (EN)"
            value={initial.customer_summary_en}
            multiline
          />
          <ReadField
            label="Customer summary (DA)"
            value={initial.customer_summary_da}
            multiline
          />
          <ReadField
            label="Language"
            value={initial.language === "da" ? "Dansk" : "English"}
          />
          <ReadField label="Labor minutes" value={initial.labor_minutes} />
          <ReadField label="Labor rate (DKK/h)" value={initial.labor_rate_dkk} />
          <ReadField
            label="Billable"
            value={initial.is_billable ? "Yes" : "Covered"}
          />
        </dl>
      </Section>
    );
  }

  return (
    <Section
      title="Details"
      description="Diagnosis and what the workshop actually did. Customer summary is what shows on the printed receipt — bilingual."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Diagnosis" htmlFor="wo-diagnosis">
          <Textarea
            id="wo-diagnosis"
            rows={3}
            value={values.diagnosis}
            onChange={(e) => update("diagnosis", e.target.value)}
            placeholder="Technician notes — what's wrong with the bike."
          />
        </Field>
        <Field label="Work performed" htmlFor="wo-work-performed">
          <Textarea
            id="wo-work-performed"
            rows={3}
            value={values.work_performed}
            onChange={(e) => update("work_performed", e.target.value)}
            placeholder="What was actually done — for the workshop log."
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer summary (English)" htmlFor="wo-summary-en">
            <Textarea
              id="wo-summary-en"
              rows={3}
              value={values.customer_summary_en}
              onChange={(e) => update("customer_summary_en", e.target.value)}
              placeholder="Plain-language summary the customer will see."
            />
          </Field>
          <Field label="Customer summary (Dansk)" htmlFor="wo-summary-da">
            <Textarea
              id="wo-summary-da"
              rows={3}
              value={values.customer_summary_da}
              onChange={(e) => update("customer_summary_da", e.target.value)}
              placeholder="Dansk-resumé til kunden."
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Language" htmlFor="wo-language">
            <Select
              value={values.language}
              onValueChange={(v) => update("language", v)}
            >
              <SelectTrigger id="wo-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="da">Dansk</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Labor minutes" htmlFor="wo-labor-minutes">
            <Input
              id="wo-labor-minutes"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values.labor_minutes}
              onChange={(e) => update("labor_minutes", e.target.value)}
              placeholder="e.g. 45"
            />
          </Field>
          <Field label="Labor rate (DKK/h)" htmlFor="wo-labor-rate">
            <Input
              id="wo-labor-rate"
              type="number"
              min={0}
              step={1}
              inputMode="decimal"
              value={values.labor_rate_dkk}
              onChange={(e) => update("labor_rate_dkk", e.target.value)}
              placeholder={String(DEFAULT_LABOR_RATE_DKK)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.is_billable}
            onChange={(e) => update("is_billable", e.target.checked)}
            className="size-4 rounded border-input"
          />
          <span>
            Billable
            <span className="text-muted-foreground ml-1.5 text-xs">
              (uncheck if a service agreement covers this repair)
            </span>
          </span>
        </label>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="text-emerald-700 dark:text-emerald-400 text-sm">
            {success}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save details"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

