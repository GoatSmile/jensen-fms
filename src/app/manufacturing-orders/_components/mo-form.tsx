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

import { createManufacturingOrder } from "../_actions/save-mo";

export type TemplateOption = {
  id: string;
  name_en: string;
  bike_model_name: string | null;
  bike_model_variant_name: string | null;
  bike_type_name: string | null;
  version: number;
  is_current: boolean;
};

export type MOFormValues = {
  bike_template_id: string;
  target_quantity: string;
  planned_start_date: string;
  planned_completion_date: string;
  notes: string;
};

export const EMPTY_MO_FORM: MOFormValues = {
  bike_template_id: "",
  target_quantity: "1",
  planned_start_date: "",
  planned_completion_date: "",
  notes: "",
};

type Props = {
  initial: MOFormValues;
  templates: TemplateOption[];
};

export function MOForm({ initial, templates }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<MOFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Only current versions are valid for MO creation.
  const eligible = useMemo(
    () => templates.filter((t) => t.is_current),
    [templates],
  );

  function update<K extends keyof MOFormValues>(key: K, value: MOFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.append(k, v as string);
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
        description="The template's parts list will be copied as the starting point. You can substitute, add, or remove parts after creation."
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
              <SelectValue placeholder="Pick a current template…" />
            </SelectTrigger>
            <SelectContent>
              {eligible.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No current templates yet. Create one in Bike templates first.
                </div>
              ) : (
                eligible.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name_en}{" "}
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      v{t.version} · {t.bike_model_name ?? "—"}
                      {t.bike_model_variant_name
                        ? ` · ${t.bike_model_variant_name}`
                        : ""}
                    </span>
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
