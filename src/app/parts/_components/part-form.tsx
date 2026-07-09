"use client";

import { useMemo, useState, useTransition } from "react";
import { Field } from "@/components/field";
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
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import {
  flattenCategoryTree,
  type FlatCategory,
} from "@/lib/parts/categories";

import { createPart, updatePart } from "../_actions/save-part";
import { CategoryPicker } from "./category-picker";

export type CategoryOption = FlatCategory;
export type CurrencyOption = { code: string; name_en: string };
export type SupplierOption = { id: string; name: string };
export type HsCodeOption = {
  id: string;
  code: string;
  description: string;
  tariffPct: number;
};

export type PartFormValues = {
  internal_sku: string;
  name_en: string;
  name_da: string;
  description_en: string;
  description_da: string;
  category_id: string;
  /** "" when unclassified. */
  hs_code_id: string;
  /** Customs origin: "eu" | "non_eu" | "" (unclassified). */
  origin: string;
  /** "" when no override; otherwise a percent string like "5" or "10.2"
   *  that gets converted to the decimal (0.05, 0.102) on submit. */
  tariff_pct_override: string;
  unit_of_measure: string;
  default_retail_price: string;
  default_retail_currency: string;
  weight_grams: string;
  reorder_point: string;
  reorder_quantity: string;
  notes: string;
  attributes: Array<{ key: string; value: string }>;
  /** Create-mode only: seed one preferred supplier offering. "" = none. */
  supplier_id: string;
  supplier_sku: string;
};

/** Sentinel value the HS picker uses for "none" — Select needs a non-empty value. */
const NO_HS_CODE = "__none__";
/** Same sentinel trick for the optional create-mode supplier picker. */
const NO_SUPPLIER = "__none__";
/** And for the origin picker's "unclassified". */
const NO_ORIGIN = "__none__";

export const EMPTY_PART_FORM: PartFormValues = {
  internal_sku: "",
  name_en: "",
  name_da: "",
  description_en: "",
  description_da: "",
  category_id: "",
  hs_code_id: "",
  origin: "",
  tariff_pct_override: "",
  unit_of_measure: "pcs",
  default_retail_price: "",
  default_retail_currency: "DKK",
  weight_grams: "",
  reorder_point: "",
  reorder_quantity: "",
  notes: "",
  attributes: [],
  supplier_id: "",
  supplier_sku: "",
};

type Props = {
  mode: "create" | "edit";
  partId?: string;
  initial: PartFormValues;
  categories: CategoryOption[];
  currencies: CurrencyOption[];
  hsCodes: HsCodeOption[];
  /** Active suppliers for the optional create-mode offering. Absent in edit. */
  suppliers?: SupplierOption[];
};

export function PartForm({
  mode,
  partId,
  initial,
  categories,
  currencies,
  hsCodes,
  suppliers = [],
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<PartFormValues>(initial);
  const categoryNodes = useMemo(
    () => flattenCategoryTree(categories),
    [categories],
  );
  // The HS list can run to hundreds of codes — a searchable combobox beats a
  // flat Select. The sentinel "none" row sits first; codes are searchable by
  // both code and description (the combobox matches label + sublabel).
  const hsOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: NO_HS_CODE, label: "Unclassified — no import duty applied" },
      ...hsCodes.map((hs) => ({
        value: hs.id,
        label: hs.code,
        sublabel: `${hs.description} · ${(hs.tariffPct * 100).toFixed(2)}%`,
      })),
    ],
    [hsCodes],
  );
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof PartFormValues>(key: K, value: PartFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function addAttribute() {
    update("attributes", [...values.attributes, { key: "", value: "" }]);
  }

  function updateAttribute(idx: number, patch: Partial<{ key: string; value: string }>) {
    update(
      "attributes",
      values.attributes.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    );
  }

  function removeAttribute(idx: number) {
    update(
      "attributes",
      values.attributes.filter((_, i) => i !== idx),
    );
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("internal_sku", values.internal_sku);
    fd.append("name_en", values.name_en);
    fd.append("name_da", values.name_da);
    fd.append("description_en", values.description_en);
    fd.append("description_da", values.description_da);
    fd.append("category_id", values.category_id);
    fd.append("hs_code_id", values.hs_code_id);
    fd.append("origin", values.origin);
    fd.append("tariff_pct_override", values.tariff_pct_override);
    fd.append("unit_of_measure", values.unit_of_measure);
    fd.append("default_retail_price", values.default_retail_price);
    fd.append("default_retail_currency", values.default_retail_currency);
    fd.append("weight_grams", values.weight_grams);
    fd.append("reorder_point", values.reorder_point);
    fd.append("reorder_quantity", values.reorder_quantity);
    fd.append("notes", values.notes);
    values.attributes.forEach((a, i) => {
      fd.append(`attr_key[${i}]`, a.key);
      fd.append(`attr_value[${i}]`, a.value);
    });
    // Create-mode only; updatePart ignores these keys.
    fd.append("supplier_id", values.supplier_id);
    fd.append("supplier_sku", values.supplier_sku);
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
          ? await createPart(fd)
          : await updatePart(partId!, fd);
      if (!result || result.ok) {
        // The action redirects on success — if we get here either it succeeded
        // (Next will navigate momentarily) or there was no result (also fine).
        return;
      }
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    if (mode === "edit" && partId) router.push(`/parts/${partId}`);
    else router.push("/parts");
  }

  const submitLabel = mode === "create" ? "Create part" : "Save changes";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title="Identification"
        description="What this part is and where it lives in the catalogue."
      >
        <Field
          label="Internal SKU"
          htmlFor="internal_sku"
          required
          error={errorField === "internal_sku" ? error : null}
        >
          <Input
            id="internal_sku"
            value={values.internal_sku}
            onChange={(e) => update("internal_sku", e.target.value)}
            placeholder="JP-AART000001"
            autoFocus={mode === "create"}
            required
          />
        </Field>
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
            required
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
          label="Category"
          htmlFor="category_id"
          required
          error={errorField === "category_id" ? error : null}
        >
          <CategoryPicker
            id="category_id"
            options={categoryNodes}
            value={values.category_id}
            onChange={(v) => update("category_id", v)}
          />
        </Field>
        <Field
          label="HS / TARIC code"
          htmlFor="hs_code_id"
          error={errorField === "hs_code_id" ? error : null}
        >
          <Combobox
            id="hs_code_id"
            value={values.hs_code_id === "" ? NO_HS_CODE : values.hs_code_id}
            onValueChange={(v) =>
              update("hs_code_id", v === NO_HS_CODE ? "" : v)
            }
            options={hsOptions}
            placeholder="Unclassified"
            searchPlaceholder="Search code or description…"
            emptyMessage="No matching HS code."
            className="h-9 w-full"
          />
        </Field>
        <Field
          label="Origin"
          htmlFor="origin"
          error={errorField === "origin" ? error : null}
        >
          <Select
            value={values.origin === "" ? NO_ORIGIN : values.origin}
            onValueChange={(v) => update("origin", v === NO_ORIGIN ? "" : v)}
          >
            <SelectTrigger id="origin">
              <SelectValue placeholder="Unclassified" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ORIGIN}>
                <span className="text-muted-foreground italic">
                  Unclassified
                </span>
              </SelectItem>
              <SelectItem value="eu">EU</SelectItem>
              <SelectItem value="non_eu">Outside EU</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Sets the default of &ldquo;Apply import tax&rdquo; on new PO
            lines — EU-origin parts skip it. Existing PO lines stay frozen.
          </p>
        </Field>
        <Field
          label="Tariff override (%)"
          htmlFor="tariff_pct_override"
          error={errorField === "tariff_pct_override" ? error : null}
        >
          <div className="flex items-center gap-2">
            <Input
              id="tariff_pct_override"
              inputMode="decimal"
              value={values.tariff_pct_override}
              onChange={(e) =>
                update("tariff_pct_override", e.target.value)
              }
              placeholder="Leave blank to use HS code"
              className="max-w-[160px]"
            />
            <span className="text-muted-foreground text-sm">%</span>
          </div>
          <p className="text-muted-foreground text-xs">
            Optional. When set, this rate is snapshotted onto new PO lines
            for this part instead of the HS code&rsquo;s rate. Use only
            when the standard classification is wrong for this specific
            part. Existing PO lines stay frozen.
          </p>
        </Field>
      </FormSection>

      {mode === "create" && suppliers.length > 0 ? (
        <FormSection
          title="Supplier (optional)"
          description="Attach one supplier and their article number now — you can add more on the part page later."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier" htmlFor="supplier_id">
              <Select
                value={values.supplier_id === "" ? NO_SUPPLIER : values.supplier_id}
                onValueChange={(v) =>
                  update("supplier_id", v === NO_SUPPLIER ? "" : v)
                }
              >
                <SelectTrigger id="supplier_id">
                  <SelectValue placeholder="No supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUPPLIER}>No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Supplier article no." htmlFor="supplier_sku">
              <Input
                id="supplier_sku"
                value={values.supplier_sku}
                onChange={(e) => update("supplier_sku", e.target.value)}
                placeholder="e.g. SG-C3001-7C"
                disabled={values.supplier_id === ""}
              />
            </Field>
          </div>
          <p className="text-muted-foreground text-xs">
            Saved as this part&rsquo;s preferred offering. Prices and lead time
            are added on the part page.
          </p>
        </FormSection>
      ) : null}

      <FormSection
        title="Description"
        description="Bilingual descriptions ride to customer documents; notes stay internal."
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
        <Field label="Internal notes" htmlFor="notes">
          <Textarea
            id="notes"
            rows={2}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Visible to staff only — never on customer documents."
          />
        </Field>
      </FormSection>

      <FormSection
        title="Specifications"
        description="Operational fields used by stock, pricing, and downstream documents."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Unit of measure"
            htmlFor="unit_of_measure"
            required
            error={errorField === "unit_of_measure" ? error : null}
          >
            <Input
              id="unit_of_measure"
              value={values.unit_of_measure}
              onChange={(e) => update("unit_of_measure", e.target.value)}
              placeholder="pcs"
              required
            />
          </Field>
          <Field
            label="Weight (grams)"
            htmlFor="weight_grams"
            error={errorField === "weight_grams" ? error : null}
          >
            <Input
              id="weight_grams"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.weight_grams}
              onChange={(e) => update("weight_grams", e.target.value)}
            />
          </Field>
          <Field
            label="Default retail price (excl. VAT)"
            htmlFor="default_retail_price"
            error={errorField === "default_retail_price" ? error : null}
          >
            <Input
              id="default_retail_price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.default_retail_price}
              onChange={(e) => update("default_retail_price", e.target.value)}
            />
          </Field>
          <Field label="Currency" htmlFor="default_retail_currency">
            <Select
              value={values.default_retail_currency}
              onValueChange={(v) => update("default_retail_currency", v)}
            >
              <SelectTrigger id="default_retail_currency">
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
          <Field
            label="Reorder point"
            htmlFor="reorder_point"
            error={errorField === "reorder_point" ? error : null}
          >
            <Input
              id="reorder_point"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.001"
              value={values.reorder_point}
              onChange={(e) => update("reorder_point", e.target.value)}
              placeholder="On-hand at-or-below this is 'low'"
            />
          </Field>
          <Field
            label="Reorder quantity"
            htmlFor="reorder_quantity"
            error={errorField === "reorder_quantity" ? error : null}
          >
            <Input
              id="reorder_quantity"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.001"
              value={values.reorder_quantity}
              onChange={(e) => update("reorder_quantity", e.target.value)}
              placeholder="Suggested order quantity"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Attributes</Label>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={addAttribute}
            >
              <Plus aria-hidden /> Add attribute
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Free-form key/value pairs (e.g. <code>color</code> = <code>black</code>,{" "}
            <code>diameter_mm</code> = <code>32</code>). Saved as JSON.
          </p>
          {values.attributes.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
              No attributes yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {values.attributes.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    aria-label={`Attribute ${i + 1} key`}
                    placeholder="key"
                    value={a.key}
                    onChange={(e) => updateAttribute(i, { key: e.target.value })}
                    className="flex-1"
                  />
                  <Input
                    aria-label={`Attribute ${i + 1} value`}
                    placeholder="value"
                    value={a.value}
                    onChange={(e) => updateAttribute(i, { value: e.target.value })}
                    className="flex-[2]"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeAttribute(i)}
                    aria-label={`Remove attribute ${i + 1}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          )}
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
          {isPending ? "Saving…" : submitLabel}
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

