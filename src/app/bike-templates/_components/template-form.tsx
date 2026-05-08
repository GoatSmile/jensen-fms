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
import { appendField } from "@/lib/forms";

import {
  createTemplate,
  updateTemplate,
} from "../_actions/save-template";

export type ModelOption = {
  id: string;
  name_en: string;
  bike_type_name: string | null;
};
export type VariantOption = {
  id: string;
  bike_model_id: string;
  sku: string;
  name_en: string;
  is_active: boolean;
};

export type TemplateShellValues = {
  bike_model_id: string;
  bike_model_variant_id: string;
  name_en: string;
  name_da: string;
  notes: string;
};

export const EMPTY_TEMPLATE_SHELL: TemplateShellValues = {
  bike_model_id: "",
  bike_model_variant_id: "all",
  name_en: "",
  name_da: "",
  notes: "",
};

type Props = {
  mode: "create" | "edit";
  templateId?: string;
  initial: TemplateShellValues;
  models: ModelOption[];
  variants: VariantOption[];
};

export function TemplateForm({
  mode,
  templateId,
  initial,
  models,
  variants,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<TemplateShellValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const variantsForModel = useMemo(
    () => variants.filter((v) => v.bike_model_id === values.bike_model_id),
    [variants, values.bike_model_id],
  );

  function update<K extends keyof TemplateShellValues>(
    key: K,
    value: TemplateShellValues[K],
  ) {
    setValues((prev) => {
      // If model changes, reset the variant — old variant doesn't belong to new model
      if (key === "bike_model_id" && value !== prev.bike_model_id) {
        return { ...prev, bike_model_id: value as string, bike_model_variant_id: "all" };
      }
      return { ...prev, [key]: value };
    });
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "bike_model_id", values.bike_model_id);
    appendField(fd, "bike_model_variant_id", values.bike_model_variant_id);
    appendField(fd, "name_en", values.name_en);
    appendField(fd, "name_da", values.name_da);
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
    if (mode === "edit" && templateId) router.push(`/bike-templates/${templateId}`);
    else router.push("/bike-templates");
  }

  const isEdit = mode === "edit";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title="What this template is for"
        description={
          isEdit
            ? "Model and variant are locked to preserve history. To re-target, save as a new version on a different model."
            : "Pick the model this recipe is for. A variant is optional — leave blank if the recipe applies to every variant of the model."
        }
      >
        <Field
          label="Bike model"
          htmlFor="tpl-model"
          required
          error={errorField === "bike_model_id" ? error : null}
        >
          {isEdit ? (
            <p className="bg-muted text-muted-foreground rounded-md border px-3 py-2 text-sm">
              {models.find((m) => m.id === values.bike_model_id)?.name_en ?? "—"}
            </p>
          ) : (
            <Select
              value={values.bike_model_id}
              onValueChange={(v) => update("bike_model_id", v)}
            >
              <SelectTrigger id="tpl-model">
                <SelectValue placeholder="Pick a model…" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name_en}
                    {m.bike_type_name ? (
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        ({m.bike_type_name})
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Variant (optional)" htmlFor="tpl-variant">
          {isEdit ? (
            <p className="bg-muted text-muted-foreground rounded-md border px-3 py-2 text-sm">
              {values.bike_model_variant_id === "all"
                ? "Any variant"
                : variants.find((v) => v.id === values.bike_model_variant_id)
                    ?.name_en ?? "—"}
            </p>
          ) : (
            <Select
              value={values.bike_model_variant_id}
              onValueChange={(v) => update("bike_model_variant_id", v)}
              disabled={!values.bike_model_id}
            >
              <SelectTrigger id="tpl-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any variant</SelectItem>
                {variantsForModel.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name_en}
                    <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                      ({v.sku})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </FormSection>

      <FormSection
        title="Identification"
        description="The template name is mostly internal but cheap to translate."
      >
        <Field
          label="Name (English)"
          htmlFor="tpl-name-en"
          required
          error={errorField === "name_en" ? error : null}
        >
          <Input
            id="tpl-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder="e.g. Hospital Service Bike — standard recipe"
            required
            autoFocus={mode === "create"}
          />
        </Field>
        <Field label="Navn (Dansk)" htmlFor="tpl-name-da">
          <Input
            id="tpl-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Notes" htmlFor="tpl-notes">
          <Textarea
            id="tpl-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Internal notes about this template — not shown to customers."
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
          {isPending
            ? "Saving…"
            : mode === "create"
              ? "Create template"
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
