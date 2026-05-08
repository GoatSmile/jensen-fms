"use client";

import { useState, useTransition } from "react";
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

import {
  createBikeModel,
  updateBikeModel,
} from "../_actions/save-bike-model";

export type BikeTypeOption = { id: string; name_en: string };
export type CurrencyOption = { code: string; name_en: string };

export type BikeModelFormValues = {
  bike_type_id: string;
  name_en: string;
  name_da: string;
  description_en: string;
  description_da: string;
  manufacturer: string;
  model_year: string;
  headline_retail_price: string;
  headline_currency: string;
  frame_number_code: string;
};

export const EMPTY_BIKE_MODEL_FORM: BikeModelFormValues = {
  bike_type_id: "",
  name_en: "",
  name_da: "",
  description_en: "",
  description_da: "",
  manufacturer: "",
  model_year: "",
  headline_retail_price: "",
  headline_currency: "DKK",
  frame_number_code: "",
};

type Props = {
  mode: "create" | "edit";
  modelId?: string;
  initial: BikeModelFormValues;
  bikeTypes: BikeTypeOption[];
  currencies: CurrencyOption[];
};

export function BikeModelForm({
  mode,
  modelId,
  initial,
  bikeTypes,
  currencies,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<BikeModelFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof BikeModelFormValues>(
    key: K,
    value: BikeModelFormValues[K],
  ) {
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
      const result =
        mode === "create"
          ? await createBikeModel(fd)
          : await updateBikeModel(modelId!, fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    if (mode === "edit" && modelId) router.push(`/bike-models/${modelId}`);
    else router.push("/bike-models");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title="Identification"
        description="What this model is and who makes it."
      >
        <Field
          label="Name (English)"
          htmlFor="name_en"
          required
          error={errorField === "name_en" ? error : null}
        >
          <Input
            id="name_en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder="e.g. Hospital Service Bike"
            required
            autoFocus={mode === "create"}
          />
        </Field>
        <Field label="Navn (Dansk)" htmlFor="name_da">
          <Input
            id="name_da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder="Optional — falls back to English when empty"
          />
        </Field>
        <Field
          label="Bike type"
          htmlFor="bike_type_id"
          required
          error={errorField === "bike_type_id" ? error : null}
        >
          <Select
            value={values.bike_type_id}
            onValueChange={(v) => update("bike_type_id", v)}
          >
            <SelectTrigger id="bike_type_id">
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Manufacturer" htmlFor="manufacturer">
            <Input
              id="manufacturer"
              value={values.manufacturer}
              onChange={(e) => update("manufacturer", e.target.value)}
              placeholder="e.g. Velorbis, Pedersen…"
            />
          </Field>
          <Field
            label="Model year"
            htmlFor="model_year"
            error={errorField === "model_year" ? error : null}
          >
            <Input
              id="model_year"
              type="number"
              inputMode="numeric"
              min={1980}
              max={2100}
              step={1}
              value={values.model_year}
              onChange={(e) => update("model_year", e.target.value)}
              placeholder="2026"
            />
          </Field>
        </div>
        <Field
          label="Frame-number code"
          htmlFor="frame_number_code"
          error={errorField === "frame_number_code" ? error : null}
        >
          <Input
            id="frame_number_code"
            value={values.frame_number_code}
            onChange={(e) =>
              update(
                "frame_number_code",
                e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
              )
            }
            maxLength={6}
            placeholder="e.g. HSB"
            className="font-mono uppercase"
          />
          <p className="text-muted-foreground text-xs">
            2–6 characters, used to suggest frame numbers like{" "}
            <code>JP-2026-{values.frame_number_code || "XXX"}-001</code>. Only a
            suggestion — you can override per bike.
          </p>
        </Field>
      </FormSection>

      <FormSection
        title="Description"
        description="Bilingual descriptions ride to customer documents (offers, invoices)."
      >
        <Field label="Description (English)" htmlFor="description_en">
          <Textarea
            id="description_en"
            rows={3}
            value={values.description_en}
            onChange={(e) => update("description_en", e.target.value)}
          />
        </Field>
        <Field label="Beskrivelse (Dansk)" htmlFor="description_da">
          <Textarea
            id="description_da"
            rows={3}
            value={values.description_da}
            onChange={(e) => update("description_da", e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Pricing"
        description="Optional headline price for the model. Variants and offers can override."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Headline retail price"
            htmlFor="headline_retail_price"
            error={errorField === "headline_retail_price" ? error : null}
          >
            <Input
              id="headline_retail_price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.headline_retail_price}
              onChange={(e) =>
                update("headline_retail_price", e.target.value)
              }
            />
          </Field>
          <Field label="Currency" htmlFor="headline_currency">
            <Select
              value={values.headline_currency}
              onValueChange={(v) => update("headline_currency", v)}
            >
              <SelectTrigger id="headline_currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
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
          {isPending
            ? "Saving…"
            : mode === "create"
              ? "Create model"
              : "Save changes"}
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
