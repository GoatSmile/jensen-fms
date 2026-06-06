"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const EMPTY_HS_CODE_FORM: HsCodeFormValues = {
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
  initial: HsCodeFormValues;
};

export function HsCodeForm({ mode, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<HsCodeFormValues>(initial);
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
      setError("Tariff must be a number between 0 and 100.");
      return;
    }
    const adRaw = values.antiDumping.trim();
    if (adRaw !== "") {
      const adPct = Number(adRaw.replace(",", "."));
      if (!Number.isFinite(adPct) || adPct < 0 || adPct > 200) {
        setError(
          "Anti-dumping must be a number between 0 and 200, or blank.",
        );
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
      <Field label="Code" htmlFor="hs-code">
        <Input
          id="hs-code"
          value={values.code}
          onChange={(e) => update("code", e.target.value)}
          placeholder="e.g. 8714.99.90"
          required
          className="font-mono"
        />
      </Field>

      <Field label="Description" htmlFor="hs-description">
        <Input
          id="hs-description"
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="e.g. Bicycle parts and accessories"
          required
        />
      </Field>

      <Field label="Tariff %" htmlFor="hs-tariff">
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
          EU import duty as a percent — e.g.{" "}
          <span className="font-mono">5</span> for 5 %,{" "}
          <span className="font-mono">10.2</span> for 10.2 %. Snapshotted
          onto each new PO line at insert.
        </p>
      </Field>

      <Field label="Anti-dumping %" htmlFor="hs-anti-dumping">
        <div className="flex items-center gap-2">
          <Input
            id="hs-anti-dumping"
            inputMode="decimal"
            value={values.antiDumping}
            onChange={(e) => update("antiDumping", e.target.value)}
            placeholder="Leave blank when none applies"
            className="max-w-[160px]"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
        <p className="text-muted-foreground text-xs">
          Optional second tariff column applied alongside the base duty
          for goods subject to EU anti-dumping measures (most Chinese-
          origin bicycle parts under heading 8714 carry{" "}
          <span className="font-mono">48.5</span> %). Snapshotted onto
          PO lines and added to the landed-cost formula.
        </p>
      </Field>

      <Field label="Notes" htmlFor="hs-notes">
        <Textarea
          id="hs-notes"
          rows={2}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Optional — e.g. footnote on rate of return."
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
          className="size-4"
        />
        Active (visible in part pickers)
      </label>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="bg-card flex items-center justify-between gap-2 rounded-md border p-3">
        <span className="text-muted-foreground text-xs">
          {savedAt
            ? `Saved · ${new Date(savedAt).toLocaleTimeString("da-DK")}`
            : mode.kind === "create"
              ? "Not yet saved"
              : "Up to date"}
        </span>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline" disabled={pending}>
            <Link href="/admin/hs-codes">Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode.kind === "create"
                ? "Add code"
                : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
