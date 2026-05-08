"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

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

import {
  createVariant,
  updateVariant,
} from "../_actions/manage-variants";

export type CurrencyOption = { code: string; name_en: string };

export type VariantFormValues = {
  sku: string;
  name_en: string;
  name_da: string;
  frame_size: string;
  color_en: string;
  color_da: string;
  retail_price: string;
  retail_currency: string;
  is_active: boolean;
  configuration: Array<{ key: string; value: string }>;
};

export const EMPTY_VARIANT_FORM: VariantFormValues = {
  sku: "",
  name_en: "",
  name_da: "",
  frame_size: "",
  color_en: "",
  color_da: "",
  retail_price: "",
  retail_currency: "DKK",
  is_active: true,
  configuration: [],
};

type Props = {
  mode: "create" | "edit";
  modelId: string;
  variantId?: string;
  initial: VariantFormValues;
  currencies: CurrencyOption[];
};

export function VariantForm({
  mode,
  modelId,
  variantId,
  initial,
  currencies,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<VariantFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof VariantFormValues>(
    key: K,
    value: VariantFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function addCfgRow() {
    update("configuration", [...values.configuration, { key: "", value: "" }]);
  }

  function updateCfgRow(idx: number, patch: Partial<{ key: string; value: string }>) {
    update(
      "configuration",
      values.configuration.map((row, i) =>
        i === idx ? { ...row, ...patch } : row,
      ),
    );
  }

  function removeCfgRow(idx: number) {
    update(
      "configuration",
      values.configuration.filter((_, i) => i !== idx),
    );
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("sku", values.sku);
    fd.append("name_en", values.name_en);
    fd.append("name_da", values.name_da);
    fd.append("frame_size", values.frame_size);
    fd.append("color_en", values.color_en);
    fd.append("color_da", values.color_da);
    fd.append("retail_price", values.retail_price);
    fd.append("retail_currency", values.retail_currency);
    fd.append("is_active", values.is_active ? "true" : "false");
    values.configuration.forEach((row, i) => {
      fd.append(`cfg_key[${i}]`, row.key);
      fd.append(`cfg_value[${i}]`, row.value);
    });
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
          ? await createVariant(modelId, fd)
          : await updateVariant(modelId, variantId!, fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    router.push(`/bike-models/${modelId}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title="Identification"
        description="The SKU is what offers and sales orders refer to."
      >
        <Field
          label="SKU"
          htmlFor="variant-sku"
          required
          error={errorField === "sku" ? error : null}
        >
          <Input
            id="variant-sku"
            value={values.sku}
            onChange={(e) => update("sku", e.target.value)}
            placeholder="e.g. JP-HSB-53W"
            required
            autoFocus={mode === "create"}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Name (English)"
            htmlFor="variant-name-en"
            required
            error={errorField === "name_en" ? error : null}
          >
            <Input
              id="variant-name-en"
              value={values.name_en}
              onChange={(e) => update("name_en", e.target.value)}
              placeholder="e.g. 53cm White"
              required
            />
          </Field>
          <Field label="Navn (Dansk)" htmlFor="variant-name-da">
            <Input
              id="variant-name-da"
              value={values.name_da}
              onChange={(e) => update("name_da", e.target.value)}
              placeholder="e.g. 53cm Hvid"
            />
          </Field>
          <Field label="Frame size" htmlFor="variant-size">
            <Input
              id="variant-size"
              value={values.frame_size}
              onChange={(e) => update("frame_size", e.target.value)}
              placeholder="e.g. 53cm"
            />
          </Field>
          <Field label="Color (English)" htmlFor="variant-color-en">
            <Input
              id="variant-color-en"
              value={values.color_en}
              onChange={(e) => update("color_en", e.target.value)}
              placeholder="e.g. White"
            />
          </Field>
          <Field label="Farve (Dansk)" htmlFor="variant-color-da">
            <Input
              id="variant-color-da"
              value={values.color_da}
              onChange={(e) => update("color_da", e.target.value)}
              placeholder="e.g. Hvid"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Pricing"
        description="Optional. Overrides the model's headline retail price for this variant."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Retail price"
            htmlFor="variant-price"
            error={errorField === "retail_price" ? error : null}
          >
            <Input
              id="variant-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.retail_price}
              onChange={(e) => update("retail_price", e.target.value)}
            />
          </Field>
          <Field label="Currency" htmlFor="variant-currency">
            <Select
              value={values.retail_currency}
              onValueChange={(v) => update("retail_currency", v)}
            >
              <SelectTrigger id="variant-currency">
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

      <FormSection
        title="Configuration"
        description="Free-form key/value pairs (e.g. battery=400Wh, motor=front-hub). Saved as JSON."
      >
        <div className="flex items-center justify-between">
          <Label className="text-sm">Attributes</Label>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={addCfgRow}
          >
            <Plus aria-hidden /> Add attribute
          </Button>
        </div>
        {values.configuration.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
            No configuration attributes yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {values.configuration.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label={`Configuration ${i + 1} key`}
                  placeholder="key"
                  value={row.key}
                  onChange={(e) => updateCfgRow(i, { key: e.target.value })}
                  className="flex-1"
                />
                <Input
                  aria-label={`Configuration ${i + 1} value`}
                  placeholder="value"
                  value={row.value}
                  onChange={(e) => updateCfgRow(i, { value: e.target.value })}
                  className="flex-[2]"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => removeCfgRow(i)}
                  aria-label={`Remove attribute ${i + 1}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
          className="size-4"
        />
        Active &mdash; available for new orders and templates
      </label>

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
              ? "Create variant"
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
