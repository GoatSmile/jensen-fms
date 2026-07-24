"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("workOrders");
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
      setSuccess(t("saved"));
      router.refresh();
    });
  }

  if (readOnly) {
    return (
      <Section
        title={t("detailsTitle")}
        description={t("detailsReadOnlyDesc")}
      >
        <dl className="flex flex-col gap-3">
          <ReadField
            label={t("diagnosis")}
            value={initial.diagnosis}
            multiline
          />
          <ReadField
            label={t("workPerformed")}
            value={initial.work_performed}
            multiline
          />
          <ReadField
            label={t("readCustomerSummaryEn")}
            value={initial.customer_summary_en}
            multiline
          />
          <ReadField
            label={t("readCustomerSummaryDa")}
            value={initial.customer_summary_da}
            multiline
          />
          <ReadField
            label={t("language")}
            value={initial.language === "da" ? t("langDa") : t("langEn")}
          />
          <ReadField label={t("laborMinutes")} value={initial.labor_minutes} />
          <ReadField label={t("laborRate")} value={initial.labor_rate_dkk} />
          <ReadField
            label={t("billableCheckbox")}
            value={initial.is_billable ? t("readYes") : t("readCovered")}
          />
        </dl>
      </Section>
    );
  }

  return (
    <Section title={t("detailsTitle")} description={t("detailsDesc")}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t("diagnosis")} htmlFor="wo-diagnosis">
          <Textarea
            id="wo-diagnosis"
            rows={3}
            value={values.diagnosis}
            onChange={(e) => update("diagnosis", e.target.value)}
            placeholder={t("diagnosisPlaceholder")}
          />
        </Field>
        <Field label={t("workPerformed")} htmlFor="wo-work-performed">
          <Textarea
            id="wo-work-performed"
            rows={3}
            value={values.work_performed}
            onChange={(e) => update("work_performed", e.target.value)}
            placeholder={t("workPerformedPlaceholder")}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("customerSummaryEn")} htmlFor="wo-summary-en">
            <Textarea
              id="wo-summary-en"
              rows={3}
              value={values.customer_summary_en}
              onChange={(e) => update("customer_summary_en", e.target.value)}
              placeholder={t("customerSummaryEnPlaceholder")}
            />
          </Field>
          <Field label={t("customerSummaryDa")} htmlFor="wo-summary-da">
            <Textarea
              id="wo-summary-da"
              rows={3}
              value={values.customer_summary_da}
              onChange={(e) => update("customer_summary_da", e.target.value)}
              placeholder={t("customerSummaryDaPlaceholder")}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("language")} htmlFor="wo-language">
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
          <Field label={t("laborMinutes")} htmlFor="wo-labor-minutes">
            <Input
              id="wo-labor-minutes"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values.labor_minutes}
              onChange={(e) => update("labor_minutes", e.target.value)}
              placeholder={t("laborMinutesPlaceholder")}
            />
          </Field>
          <Field label={t("laborRate")} htmlFor="wo-labor-rate">
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
        {Number(values.labor_minutes) > 0 && !values.labor_rate_dkk.trim() ? (
          <p
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
            role="alert"
          >
            {t("laborNoRateWarning")}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.is_billable}
            onChange={(e) => update("is_billable", e.target.checked)}
            className="size-4 rounded border-input"
          />
          <span>
            {t("billableCheckbox")}
            <span className="text-muted-foreground ml-1.5 text-xs">
              {t("billableHint")}
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
            {isPending ? t("saving") : t("saveDetails")}
          </Button>
        </div>
      </form>
    </Section>
  );
}

