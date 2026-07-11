"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";

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
import { familyTint } from "@/lib/bike-templates/family-colors";

import {
  createTemplate,
  updateTemplate,
} from "../_actions/save-template";

export type BikeTypeOption = {
  id: string;
  name_en: string;
};

export type CurrencyOption = {
  code: string;
  symbol: string | null;
};

export type FamilyOption = {
  id: string;
  name: string;
};

export type TemplateShellValues = {
  bike_type_id: string;
  /** FK to bike_families; "" = no family. */
  family_id: string;
  frame_size: string;
  name_en: string;
  name_da: string;
  default_retail_price: string;
  default_retail_currency: string;
  notes: string;
};

export const EMPTY_TEMPLATE_SHELL: TemplateShellValues = {
  bike_type_id: "",
  family_id: "",
  frame_size: "",
  name_en: "",
  name_da: "",
  default_retail_price: "",
  default_retail_currency: "DKK",
  notes: "",
};

/** Sentinel — Select needs a non-empty value for the "no family" option. */
const NO_FAMILY = "__none__";

type Props = {
  mode: "create" | "edit";
  templateId?: string;
  initial: TemplateShellValues;
  bikeTypes: BikeTypeOption[];
  currencies: CurrencyOption[];
  families: FamilyOption[];
};

export function TemplateForm({
  mode,
  templateId,
  initial,
  bikeTypes,
  currencies,
  families,
}: Props) {
  const t = useTranslations("templates");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [values, setValues] = useState<TemplateShellValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof TemplateShellValues>(
    key: K,
    value: TemplateShellValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "bike_type_id", values.bike_type_id);
    appendField(fd, "family_id", values.family_id);
    appendField(fd, "frame_size", values.frame_size);
    appendField(fd, "name_en", values.name_en);
    appendField(fd, "name_da", values.name_da);
    appendField(fd, "default_retail_price", values.default_retail_price);
    appendField(fd, "default_retail_currency", values.default_retail_currency);
    appendField(fd, "notes", values.notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createTemplate(fd)
          : await updateTemplate(templateId!, fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    if (mode === "edit" && templateId)
      router.push(`/bike-templates/${templateId}`);
    else router.push("/bike-templates");
  }

  const isEdit = mode === "edit";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title={t("formSectionPurpose")}
        description={
          isEdit
            ? t("formSectionPurposeDescEdit")
            : t("formSectionPurposeDescCreate")
        }
      >
        <Field
          label={t("bikeType")}
          htmlFor="tpl-bike-type"
          required
          error={errorField === "bike_type_id" ? error : null}
        >
          {isEdit ? (
            <p className="bg-muted text-muted-foreground rounded-md border px-3 py-2 text-sm">
              {bikeTypes.find((t) => t.id === values.bike_type_id)?.name_en ??
                "—"}
            </p>
          ) : (
            <Select
              value={values.bike_type_id}
              onValueChange={(v) => update("bike_type_id", v)}
            >
              <SelectTrigger id="tpl-bike-type">
                <SelectValue placeholder={t("pickType")} />
              </SelectTrigger>
              <SelectContent>
                {bikeTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field
          label={t("family")}
          htmlFor="tpl-family"
          error={errorField === "family_id" ? error : null}
        >
          <Select
            value={values.family_id === "" ? NO_FAMILY : values.family_id}
            onValueChange={(v) =>
              update("family_id", v === NO_FAMILY ? "" : v)
            }
          >
            <SelectTrigger id="tpl-family">
              <SelectValue placeholder={t("noFamily")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FAMILY}>{t("noFamily")}</SelectItem>
              {families.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  <span
                    className={`size-2 rounded-full ${familyTint(f.id).dot}`}
                    aria-hidden
                  />
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{t("familyHint")}</p>
        </Field>
        <Field
          label={t("frameSize")}
          htmlFor="tpl-frame-size"
          required
          error={errorField === "frame_size" ? error : null}
        >
          <Input
            id="tpl-frame-size"
            value={values.frame_size}
            onChange={(e) => update("frame_size", e.target.value)}
            placeholder={t("frameSizePlaceholder")}
            required
          />
        </Field>
      </FormSection>

      <FormSection
        title={t("formSectionIdentification")}
        description={t("formSectionIdentificationDesc")}
      >
        <Field
          label={t("nameEn")}
          htmlFor="tpl-name-en"
          required
          error={errorField === "name_en" ? error : null}
        >
          <Input
            id="tpl-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder={t("nameEnPlaceholder")}
            required
            autoFocus={mode === "create"}
          />
        </Field>
        <Field label={t("nameDa")} htmlFor="tpl-name-da">
          <Input
            id="tpl-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder={t("nameDaPlaceholder")}
          />
        </Field>
      </FormSection>

      <FormSection
        title={t("formSectionPrice")}
        description={t("formSectionPriceDesc")}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label={t("price")}
            htmlFor="tpl-price"
            error={errorField === "default_retail_price" ? error : null}
          >
            <Input
              id="tpl-price"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={values.default_retail_price}
              onChange={(e) =>
                update("default_retail_price", e.target.value)
              }
              placeholder="0,00"
            />
          </Field>
          <Field label={t("currency")} htmlFor="tpl-currency">
            <Select
              value={values.default_retail_currency}
              onValueChange={(v) => update("default_retail_currency", v)}
            >
              <SelectTrigger id="tpl-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection
        title={t("formSectionNotes")}
        description={t("formSectionNotesDesc")}
      >
        <Field label={t("notesLabel")} htmlFor="tpl-notes">
          <Textarea
            id="tpl-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
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
          {isPending
            ? tCommon("saving")
            : mode === "create"
              ? t("createTemplate")
              : t("saveChanges")}
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

