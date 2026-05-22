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

import { createManufacturingOrder } from "../_actions/save-mo";

export type BikeTypeOption = { id: string; name_en: string };

export type TemplateOption = {
  id: string;
  name_en: string;
  family: string | null;
  frame_size: string;
  version: number;
  is_current: boolean;
  bike_type_id: string;
  bike_type_name: string | null;
};

export type ColorOption = {
  id: string;
  slug: string;
  name_da: string;
  name_en: string;
  hex: string | null;
};

/**
 * The form supports two paths:
 *   1. Template-driven: pick a template; type comes from the template, BOM
 *      gets seeded from bike_template_parts.
 *   2. One-off: pick the literal "(One-off — no template)" entry, then pick
 *      a bike type by hand. No BOM is seeded; user adds parts on the detail
 *      page.
 *
 * Color is required when a template is picked (one MO = one template ×
 * one color × N bikes). For one-offs, color is optional.
 */
export type MOFormValues = {
  bike_template_id: string; // "" or "__none__" for one-off
  bike_type_id: string; // only used when bike_template_id is "__none__"
  color_id: string;
  target_quantity: string;
  planned_start_date: string;
  planned_completion_date: string;
  notes: string;
};

export const EMPTY_MO_FORM: MOFormValues = {
  bike_template_id: "",
  bike_type_id: "",
  color_id: "",
  target_quantity: "1",
  planned_start_date: "",
  planned_completion_date: "",
  notes: "",
};

export const ONE_OFF_VALUE = "__none__";

type Props = {
  initial: MOFormValues;
  templates: TemplateOption[];
  bikeTypes: BikeTypeOption[];
  colors: ColorOption[];
};

export function MOForm({ initial, templates, bikeTypes, colors }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<MOFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const eligible = useMemo(
    () => templates.filter((t) => t.is_current),
    [templates],
  );
  const isOneOff = values.bike_template_id === ONE_OFF_VALUE;
  const hasTemplate =
    values.bike_template_id !== "" && values.bike_template_id !== ONE_OFF_VALUE;

  function update<K extends keyof MOFormValues>(key: K, value: MOFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    // Map the sentinel "__none__" to empty so the action treats it as null.
    const tplValue = isOneOff ? "" : values.bike_template_id;
    appendField(fd, "bike_template_id", tplValue);
    appendField(fd, "bike_type_id", values.bike_type_id);
    appendField(fd, "color_id", values.color_id);
    appendField(fd, "target_quantity", values.target_quantity);
    appendField(fd, "planned_start_date", values.planned_start_date);
    appendField(fd, "planned_completion_date", values.planned_completion_date);
    appendField(fd, "notes", values.notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    startTransition(async () => {
      const result = await createManufacturingOrder(fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    router.push("/manufacturing-orders");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title="Recipe"
        description="Pick a template to seed the parts list, or choose one-off to build the parts list by hand on the next screen."
      >
        <Field
          label="Template"
          htmlFor="mo-template"
          required
          error={errorField === "bike_template_id" ? error : null}
        >
          <Select
            value={values.bike_template_id}
            onValueChange={(v) => update("bike_template_id", v)}
          >
            <SelectTrigger id="mo-template">
              <SelectValue placeholder="Pick a template or one-off…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ONE_OFF_VALUE}>
                (One-off — no template)
              </SelectItem>
              {eligible.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No current templates yet. Create one in Bike templates first.
                </div>
              ) : (
                eligible.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {[t.family, t.frame_size, t.name_en]
                      .filter(Boolean)
                      .join(" · ")}
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      v{t.version}
                      {t.bike_type_name ? ` · ${t.bike_type_name}` : ""}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>

        {isOneOff ? (
          <Field
            label="Bike type"
            htmlFor="mo-bike-type"
            required
            error={errorField === "bike_type_id" ? error : null}
          >
            <Select
              value={values.bike_type_id}
              onValueChange={(v) => update("bike_type_id", v)}
            >
              <SelectTrigger id="mo-bike-type">
                <SelectValue placeholder="Pick a bike type…" />
              </SelectTrigger>
              <SelectContent>
                {bikeTypes.map((bt) => (
                  <SelectItem key={bt.id} value={bt.id}>
                    {bt.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field
          label={`Colour${hasTemplate ? "" : " (optional)"}`}
          htmlFor="mo-color"
          required={hasTemplate}
          error={errorField === "color_id" ? error : null}
        >
          <Select
            value={values.color_id === "" ? "__none__" : values.color_id}
            onValueChange={(v) =>
              update("color_id", v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger id="mo-color">
              <SelectValue
                placeholder={
                  hasTemplate ? "Pick a colour…" : "Unpainted / not decided yet"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {/* Template-driven MOs require a colour (paint orders need one);
                  one-off MOs allow unpainted. */}
              {!hasTemplate ? (
                <SelectItem value="__none__">
                  <span className="text-muted-foreground italic">
                    Unpainted (no colour)
                  </span>
                </SelectItem>
              ) : null}
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
        title="Production plan"
        description="How many bikes and when. Dates are advisory; actuals are stamped when the MO transitions through its states."
      >
        <Field
          label="Target quantity"
          htmlFor="mo-target"
          required
          error={errorField === "target_quantity" ? error : null}
        >
          <Input
            id="mo-target"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={values.target_quantity}
            onChange={(e) => update("target_quantity", e.target.value)}
            required
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Planned start date" htmlFor="mo-start">
            <Input
              id="mo-start"
              type="date"
              value={values.planned_start_date}
              onChange={(e) => update("planned_start_date", e.target.value)}
            />
          </Field>
          <Field label="Planned completion date" htmlFor="mo-end">
            <Input
              id="mo-end"
              type="date"
              value={values.planned_completion_date}
              onChange={(e) =>
                update("planned_completion_date", e.target.value)
              }
            />
          </Field>
        </div>
        <Field label="Notes" htmlFor="mo-notes">
          <Textarea
            id="mo-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Internal — e.g. 'gift batch for Aarhus opening' or 'demo bikes for spring fair'."
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
          {isPending ? "Creating…" : "Create manufacturing order"}
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
