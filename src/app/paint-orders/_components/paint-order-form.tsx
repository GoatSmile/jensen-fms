"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

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
import { ColorSwatch } from "@/components/color-swatch";
import { colorFinishLabel } from "@/lib/colors/coating";
import { localizedName } from "@/i18n/vocab";
import { appendField } from "@/lib/forms";

import { createPaintOrder } from "../_actions/save-paint-order";

export type SupplierOption = { id: string; name: string };

export type ColorOption = {
  id: string;
  name_en: string;
  name_da?: string | null;
  hex: string | null;
  /** Optional finish info — populated by paint surfaces so pickers can
   * disambiguate e.g. a glossy and a matte "Black 9005". */
  ral_code?: string | null;
  coating?: string | null;
};

export type PaintOrderFormValues = {
  supplier_id: string;
  color_id: string;
  planned_send_date: string;
  notes: string;
};

const EMPTY_PAINT_ORDER_FORM: PaintOrderFormValues = {
  supplier_id: "",
  color_id: "",
  planned_send_date: "",
  notes: "",
};

type Props = {
  /** Overrides only — unset fields fall back to EMPTY_PAINT_ORDER_FORM. */
  initial?: Partial<PaintOrderFormValues>;
  suppliers: SupplierOption[];
  colors: ColorOption[];
};

export function PaintOrderForm({ initial, suppliers, colors }: Props) {
  const t = useTranslations("paintOrders");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: PaintOrderFormValues = { ...EMPTY_PAINT_ORDER_FORM, ...initial };
  const [values, setValues] = useState<PaintOrderFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof PaintOrderFormValues>(
    key: K,
    value: PaintOrderFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "supplier_id", values.supplier_id);
    appendField(fd, "color_id", values.color_id);
    appendField(fd, "planned_send_date", values.planned_send_date);
    appendField(fd, "notes", values.notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    startTransition(async () => {
      const result = await createPaintOrder(fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    router.push("/paint-orders");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection title={t("whoWhatTitle")} description={t("whoWhatDesc")}>
        <Field
          label={t("supplier")}
          htmlFor="paint-supplier"
          required
          error={errorField === "supplier_id" ? error : null}
        >
          <Select
            value={values.supplier_id}
            onValueChange={(v) => update("supplier_id", v)}
          >
            <SelectTrigger id="paint-supplier">
              <SelectValue placeholder={t("pickSupplierPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {suppliers.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  {t("noActiveSuppliers")}
                </div>
              ) : (
                suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={t("batchColour")}
          htmlFor="paint-color"
          error={errorField === "color_id" ? error : null}
        >
          <Select
            value={values.color_id}
            onValueChange={(v) => update("color_id", v)}
          >
            <SelectTrigger id="paint-color">
              <SelectValue placeholder={t("batchColourPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {colors.map((c) => {
                const label = localizedName(locale, c.name_en, c.name_da);
                return (
                <SelectItem key={c.id} value={c.id}>
                  <ColorSwatch hex={c.hex} label={label} />
                  {label}
                  {colorFinishLabel(c.ral_code, c.coating, locale === "da" ? "da" : "en") ? (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      {colorFinishLabel(c.ral_code, c.coating, locale === "da" ? "da" : "en")}
                    </span>
                  ) : null}
                </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection title={t("scheduleTitle")} description={t("scheduleDesc")}>
        <Field label={t("plannedSendDate")} htmlFor="paint-send-date">
          <Input
            id="paint-send-date"
            type="date"
            value={values.planned_send_date}
            onChange={(e) => update("planned_send_date", e.target.value)}
          />
        </Field>
        <Field label={t("notes")} htmlFor="paint-notes">
          <Textarea
            id="paint-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder={t("notesPlaceholder")}
          />
        </Field>
      </FormSection>

      {error && !errorField ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("creating") : t("createPaintOrder")}
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border">
      <header className="flex flex-col gap-0.5 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}
