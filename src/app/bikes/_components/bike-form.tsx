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

import { createBike } from "../_actions/save-bike";

export type BikeTypeOption = { id: string; name_en: string };
export type ModelOption = {
  id: string;
  name_en: string;
  bike_type_id: string;
};
export type VariantOption = {
  id: string;
  bike_model_id: string;
  sku: string;
  name_en: string;
};
export type TemplateOption = {
  id: string;
  bike_model_id: string;
  bike_model_variant_id: string | null;
  name_en: string;
  version: number;
};

export type BikeFormValues = {
  bike_type_id: string;
  bike_model_id: string;
  bike_model_variant_id: string;
  template_id: string;
  frame_number: string;
  notes: string;
};

export const EMPTY_BIKE_FORM: BikeFormValues = {
  bike_type_id: "",
  bike_model_id: "",
  bike_model_variant_id: "",
  template_id: "",
  frame_number: "",
  notes: "",
};

type Props = {
  initial: BikeFormValues;
  bikeTypes: BikeTypeOption[];
  models: ModelOption[];
  variants: VariantOption[];
  templates: TemplateOption[];
};

export function BikeForm({
  initial,
  bikeTypes,
  models,
  variants,
  templates,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<BikeFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const modelsForType = useMemo(
    () =>
      values.bike_type_id
        ? models.filter((m) => m.bike_type_id === values.bike_type_id)
        : models,
    [models, values.bike_type_id],
  );
  const variantsForModel = useMemo(
    () =>
      values.bike_model_id
        ? variants.filter((v) => v.bike_model_id === values.bike_model_id)
        : [],
    [variants, values.bike_model_id],
  );
  const templatesForVariantOrModel = useMemo(() => {
    if (!values.bike_model_id) return [];
    return templates.filter((t) => {
      if (t.bike_model_id !== values.bike_model_id) return false;
      // If a variant is chosen, prefer templates pinned to that variant or any.
      if (values.bike_model_variant_id) {
        return (
          t.bike_model_variant_id === values.bike_model_variant_id ||
          t.bike_model_variant_id == null
        );
      }
      return true;
    });
  }, [templates, values.bike_model_id, values.bike_model_variant_id]);

  function update<K extends keyof BikeFormValues>(
    key: K,
    value: BikeFormValues[K],
  ) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Reset dependent selections when an upstream picker changes
      if (key === "bike_type_id" && value !== prev.bike_type_id) {
        next.bike_model_id = "";
        next.bike_model_variant_id = "";
        next.template_id = "";
      } else if (key === "bike_model_id" && value !== prev.bike_model_id) {
        next.bike_model_variant_id = "";
        next.template_id = "";
      } else if (
        key === "bike_model_variant_id" &&
        value !== prev.bike_model_variant_id
      ) {
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
    fd.append("bike_type_id", values.bike_type_id);
    fd.append("bike_model_id", values.bike_model_id);
    fd.append("bike_model_variant_id", values.bike_model_variant_id);
    fd.append("template_id", values.template_id);
    fd.append("frame_number", values.frame_number);
    fd.append("notes", values.notes);
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
        description="The type drives which identifiers will be required. Model, variant, and template are optional — useful when the bike was built against a known recipe, omit for one-offs."
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
        <Field label="Model (optional)" htmlFor="bike-model">
          <Select
            value={values.bike_model_id}
            onValueChange={(v) => update("bike_model_id", v)}
            disabled={!values.bike_type_id}
          >
            <SelectTrigger id="bike-model">
              <SelectValue
                placeholder={
                  values.bike_type_id ? "Pick a model…" : "Pick a type first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {modelsForType.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No active models for this type.
                </div>
              ) : (
                modelsForType.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name_en}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Variant (optional)" htmlFor="bike-variant">
          <Select
            value={values.bike_model_variant_id}
            onValueChange={(v) => update("bike_model_variant_id", v)}
            disabled={!values.bike_model_id}
          >
            <SelectTrigger id="bike-variant">
              <SelectValue
                placeholder={
                  values.bike_model_id ? "Pick a variant…" : "Pick a model first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {variantsForModel.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No active variants for this model.
                </div>
              ) : (
                variantsForModel.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name_en}
                    <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                      ({v.sku})
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Template (optional)" htmlFor="bike-template">
          <Select
            value={values.template_id}
            onValueChange={(v) => update("template_id", v)}
            disabled={!values.bike_model_id}
          >
            <SelectTrigger id="bike-template">
              <SelectValue
                placeholder={
                  values.bike_model_id ? "Pick a template…" : "Pick a model first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {templatesForVariantOrModel.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No current templates for this combination.
                </div>
              ) : (
                templatesForVariantOrModel.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name_en}{" "}
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      v{t.version}
                    </span>
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
