"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { createBike } from "../_actions/save-bike";

export type BikeTypeOption = { id: string; name_en: string };

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

export const EMPTY_BIKE_FORM: BikeFormValues = {
  bike_type_id: "",
  template_id: "",
  color_id: "",
  frame_number: "",
  notes: "",
};

type Props = {
  initial: BikeFormValues;
  bikeTypes: BikeTypeOption[];
  templates: TemplateOption[];
  colors: ColorOption[];
};

export function BikeForm({ initial, bikeTypes, templates, colors }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<BikeFormValues>(initial);
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
        title="What kind of bike"
        description="The type drives which identifiers will be required. Pick a template if this bike was built against a known recipe; leave blank for one-offs."
      >
        <Field
          label="Bike type"
          htmlFor="bike-type"
          required
          error={errorField === "bike_type_id" ? error : null}
        >
          <Select
            value={values.bike_type_id}
            onValueChange={(v) => update("bike_type_id", v)}
          >
            <SelectTrigger id="bike-type">
              <SelectValue placeholder="Pick a bike type…" />
            </SelectTrigger>
            <SelectContent>
              {bikeTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Template (optional)" htmlFor="bike-template">
          <Select
            value={values.template_id}
            onValueChange={(v) => update("template_id", v)}
          >
            <SelectTrigger id="bike-template">
              <SelectValue placeholder="Pick a template…" />
            </SelectTrigger>
            <SelectContent>
              {templatesForType.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No current templates
                  {values.bike_type_id ? " for this type." : "."}
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
        <Field label="Colour (optional)" htmlFor="bike-color">
          <Select
            value={values.color_id === "" ? "__none__" : values.color_id}
            onValueChange={(v) =>
              update("color_id", v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger id="bike-color">
              <SelectValue placeholder="Unpainted / not decided yet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                <span className="text-muted-foreground italic">
                  Unpainted (no colour)
                </span>
              </SelectItem>
              {colors.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No active colours.
                </div>
              ) : (
                colors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <ColorSwatch hex={c.hex} label={c.name_en} />
                    {c.name_en}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title="Identification"
        description="Frame number is the natural unique key. Other identifiers (lock, battery, charger, AirTag, etc.) get registered after creation."
      >
        <Field
          label="Frame number"
          htmlFor="bike-frame-number"
          required
          error={errorField === "frame_number" ? error : null}
        >
          <Input
            id="bike-frame-number"
            value={values.frame_number}
            onChange={(e) => update("frame_number", e.target.value)}
            placeholder="e.g. JP-2026-HSB-001"
            className="font-mono"
            required
          />
        </Field>
        <Field label="Notes" htmlFor="bike-notes">
          <Textarea
            id="bike-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Internal notes — not shown to customers."
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
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Create bike"}
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

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
