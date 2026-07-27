"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";

import { createHsCode, updateHsCode } from "../_actions/manage-hs-codes";

export type HsCodeFormValues = {
  code: string;
  description: string;
  /** Tariff as percent string (e.g. "5.2" for 5.2%). Converted to the
   *  DB-side decimal (0.052) on submit. */
  tariff: string;
  /** Anti-dumping as percent string (e.g. "48.5" for 48.5%). Blank when
   *  no anti-dumping applies. Same percent↔decimal conversion. */
  antiDumping: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_HS_CODE_FORM: HsCodeFormValues = {
  code: "",
  description: "",
  tariff: "",
  antiDumping: "",
  notes: "",
  is_active: true,
};

type Mode = { kind: "create" } | { kind: "edit"; id: string };

type Props = {
  mode: Mode;
  /** Overrides only — unset fields fall back to EMPTY_HS_CODE_FORM. */
  initial?: Partial<HsCodeFormValues>;
};

export function HsCodeForm({ mode, initial }: Props) {
  const router = useRouter();
  const t = useTranslations("adminHsCodes");
  const tCommon = useTranslations("common");
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: HsCodeFormValues = { ...EMPTY_HS_CODE_FORM, ...initial };
  const [values, setValues] = useState<HsCodeFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update<K extends keyof HsCodeFormValues>(
    key: K,
    value: HsCodeFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function buildFormData(): FormData {
    const tariffPct = Number(values.tariff.trim().replace(",", "."));
    const tariffDecimal = Number.isFinite(tariffPct) ? tariffPct / 100 : NaN;
    const adRaw = values.antiDumping.trim();
    const adPct = adRaw === "" ? null : Number(adRaw.replace(",", "."));
    const adDecimal =
      adPct != null && Number.isFinite(adPct) ? adPct / 100 : null;
    const fd = new FormData();
    appendField(fd, "code", values.code.trim());
    appendField(fd, "description", values.description.trim());
    appendField(
      fd,
      "tariff_pct",
      Number.isFinite(tariffDecimal) ? String(tariffDecimal) : "",
    );
    appendField(
      fd,
      "anti_dumping_pct",
      adDecimal != null ? String(adDecimal) : "",
    );
    appendField(fd, "notes", values.notes);
    if (values.is_active) fd.set("is_active", "on");
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const tariffPct = Number(values.tariff.trim().replace(",", "."));
    if (!Number.isFinite(tariffPct) || tariffPct < 0 || tariffPct > 100) {
      setError(t("tariffError"));
      return;
    }
    const adRaw = values.antiDumping.trim();
    if (adRaw !== "") {
      const adPct = Number(adRaw.replace(",", "."));
      if (!Number.isFinite(adPct) || adPct < 0 || adPct > 200) {
        setError(t("antiDumpingError"));
        return;
      }
    }
    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "create"
          ? await createHsCode(fd)
          : await updateHsCode(mode.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (mode.kind === "create") {
        router.push("/admin/hs-codes");
        router.refresh();
      } else {
        setSavedAt(new Date().toISOString());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label={t("codeLabel")} htmlFor="hs-code">
        <Input
          id="hs-code"
          value={values.code}
          onChange={(e) => update("code", e.target.value)}
          placeholder={t("codePlaceholder")}
          required
          className="font-mono"
        />
      </Field>

      <Field label={t("descriptionLabel")} htmlFor="hs-description">
        <Input
          id="hs-description"
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          required
        />
      </Field>

      <Field label={t("tariffLabel")} htmlFor="hs-tariff">
        <div className="flex items-center gap-2">
          <Input
            id="hs-tariff"
            inputMode="decimal"
            value={values.tariff}
            onChange={(e) => update("tariff", e.target.value)}
            placeholder="5"
            required
            className="max-w-[160px]"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
        <p className="text-muted-foreground text-xs">
          {t.rich("tariffHint", {
            mono: (chunks) => <span className="font-mono">{chunks}</span>,
          })}
        </p>
      </Field>

      <Field label={t("antiDumpingLabel")} htmlFor="hs-anti-dumping">
        <div className="flex items-center gap-2">
          <Input
            id="hs-anti-dumping"
            inputMode="decimal"
            value={values.antiDumping}
            onChange={(e) => update("antiDumping", e.target.value)}
            placeholder={t("antiDumpingPlaceholder")}
            className="max-w-[160px]"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
        <p className="text-muted-foreground text-xs">
          {t.rich("antiDumpingHint", {
            mono: (chunks) => <span className="font-mono">{chunks}</span>,
          })}
        </p>
      </Field>

      <Field label={t("notesLabel")} htmlFor="hs-notes">
        <Textarea
          id="hs-notes"
          rows={2}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder={t("notesPlaceholder")}
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
          className="size-4"
        />
        {t("activeCheckbox")}
      </label>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="bg-card flex items-center justify-between gap-2 rounded-md border p-3">
        <span className="text-muted-foreground text-xs">
          {savedAt
            ? t("savedStatus", {
                time: new Date(savedAt).toLocaleTimeString("da-DK"),
              })
            : mode.kind === "create"
              ? t("notYetSaved")
              : t("upToDate")}
        </span>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline" disabled={pending}>
            <Link href="/admin/hs-codes">{tCommon("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? tCommon("saving")
              : mode.kind === "create"
                ? t("addCode")
                : t("submitEdit")}
          </Button>
        </div>
      </div>
    </form>
  );
}

