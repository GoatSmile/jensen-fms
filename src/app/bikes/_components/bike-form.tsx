"use client";

import { useMemo, useState, useTransition } from "react";
import { Field } from "@/components/field";
import { FormSection } from "@/components/form-section";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

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
import { appendField } from "@/lib/forms";
import { localizedName } from "@/i18n/vocab";

import { createBike } from "../_actions/save-bike";

export type BikeTypeOption = {
  id: string;
  name_en: string;
  name_da?: string | null;
};

export type TemplateOption = {
  id: string;
  name_en: string;
  family: string | null;
  frame_size: string;
  version: number;
  bike_type_id: string;
};

export type ColorOption = {
  id: string;
  slug: string;
  name_da: string;
  name_en: string;
  hex: string | null;
};

export type BikeFormValues = {
  bike_type_id: string;
  template_id: string;
  color_id: string;
  frame_number: string;
  notes: string;
};

const EMPTY_BIKE_FORM: BikeFormValues = {
  bike_type_id: "",
  template_id: "",
  color_id: "",
  frame_number: "",
  notes: "",
};

type Props = {
  /** Overrides only — unset fields fall back to EMPTY_BIKE_FORM. */
  initial?: Partial<BikeFormValues>;
  bikeTypes: BikeTypeOption[];
  templates: TemplateOption[];
  colors: ColorOption[];
};

export function BikeForm({ initial, bikeTypes, templates, colors }: Props) {
  const t = useTranslations("bikes");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: BikeFormValues = { ...EMPTY_BIKE_FORM, ...initial };
  const [values, setValues] = useState<BikeFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Templates are filtered by the picked bike_type. If no type is picked yet,
  // show everything so the user can preview the catalog.
  const templatesForType = useMemo(
    () =>
      values.bike_type_id
        ? templates.filter((t) => t.bike_type_id === values.bike_type_id)
        : templates,
    [templates, values.bike_type_id],
  );

  function update<K extends keyof BikeFormValues>(
    key: K,
    value: BikeFormValues[K],
  ) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Changing bike type invalidates the previously picked template.
      if (key === "bike_type_id" && value !== prev.bike_type_id) {
        next.template_id = "";
      }
      return next;
    });
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "bike_type_id", values.bike_type_id);
    appendField(fd, "template_id", values.template_id);
    appendField(fd, "color_id", values.color_id);
    appendField(fd, "frame_number", values.frame_number);
    appendField(fd, "notes", values.notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    startTransition(async () => {
      const result = await createBike(fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    router.push("/bikes");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title={t("kindTitle")}
        description={t("kindDesc")}
      >
        <Field
          label={t("bikeType")}
          htmlFor="bike-type"
          required
          error={errorField === "bike_type_id" ? error : null}
        >
          <Select
            value={values.bike_type_id}
            onValueChange={(v) => update("bike_type_id", v)}
          >
            <SelectTrigger id="bike-type">
              <SelectValue placeholder={t("pickBikeType")} />
            </SelectTrigger>
            <SelectContent>
              {bikeTypes.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {localizedName(locale, opt.name_en, opt.name_da)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("templateOptional")} htmlFor="bike-template">
          <Select
            value={values.template_id}
            onValueChange={(v) => update("template_id", v)}
          >
            <SelectTrigger id="bike-template">
              <SelectValue placeholder={t("pickTemplate")} />
            </SelectTrigger>
            <SelectContent>
              {templatesForType.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  {values.bike_type_id
                    ? t("noTemplatesForType")
                    : t("noTemplates")}
                </div>
              ) : (
                templatesForType.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {[t.family, t.frame_size, t.name_en]
                      .filter(Boolean)
                      .join(" · ")}
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      v{t.version}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("colourOptional")} htmlFor="bike-color">
          <Select
            value={values.color_id === "" ? "__none__" : values.color_id}
            onValueChange={(v) =>
              update("color_id", v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger id="bike-color">
              <SelectValue placeholder={t("unpaintedPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                <span className="text-muted-foreground italic">
                  {t("unpaintedOption")}
                </span>
              </SelectItem>
              {colors.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  {t("noColours")}
                </div>
              ) : (
                colors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <ColorSwatch
                      hex={c.hex}
                      label={localizedName(locale, c.name_en, c.name_da)}
                    />
                    {localizedName(locale, c.name_en, c.name_da)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title={t("identTitle")}
        description={t("identDesc")}
      >
        <Field
          label={t("frameNumber")}
          htmlFor="bike-frame-number"
          required
          error={errorField === "frame_number" ? error : null}
        >
          <Input
            id="bike-frame-number"
            value={values.frame_number}
            onChange={(e) => update("frame_number", e.target.value)}
            placeholder={t("framePlaceholder")}
            className="font-mono"
            required
          />
        </Field>
        <Field label={t("notes")} htmlFor="bike-notes">
          <Textarea
            id="bike-notes"
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
          {isPending ? tCommon("saving") : t("createBike")}
        </Button>
      </div>
    </form>
  );
}

