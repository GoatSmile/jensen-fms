"use client";

import { useState, useTransition } from "react";
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
import { ColorSwatch } from "@/components/color-swatch";
import { colorFinishLabel } from "@/lib/colors/coating";
import { appendField } from "@/lib/forms";

import { createPaintOrder } from "../_actions/save-paint-order";

export type SupplierOption = { id: string; name: string };

export type ColorOption = {
  id: string;
  name_en: string;
  hex: string | null;
  /** Optional finish info — populated by paint surfaces so pickers can
   * disambiguate e.g. a glossy and a matte "Black 9005". */
  ral_code?: string | null;
  coating?: string | null;
};

export type PaintPartOption = {
  id: string;
  internal_sku: string;
  name_en: string;
};

export type CurrencyOption = { code: string };

export type PaintOrderFormValues = {
  supplier_id: string;
  color_id: string;
  paint_part_id: string;
  unit_cost: string;
  unit_cost_currency: string;
  planned_send_date: string;
  notes: string;
};

export const EMPTY_PAINT_ORDER_FORM: PaintOrderFormValues = {
  supplier_id: "",
  color_id: "",
  paint_part_id: "",
  unit_cost: "",
  unit_cost_currency: "DKK",
  planned_send_date: "",
  notes: "",
};

type Props = {
  initial: PaintOrderFormValues;
  suppliers: SupplierOption[];
  colors: ColorOption[];
  paintParts: PaintPartOption[];
  currencies: CurrencyOption[];
};

export function PaintOrderForm({
  initial,
  suppliers,
  colors,
  paintParts,
  currencies,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<PaintOrderFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof PaintOrderFormValues>(
    key: K,
    value: PaintOrderFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "supplier_id", values.supplier_id);
    appendField(fd, "color_id", values.color_id);
    appendField(fd, "paint_part_id", values.paint_part_id);
    appendField(fd, "unit_cost", values.unit_cost);
    appendField(fd, "unit_cost_currency", values.unit_cost_currency);
    appendField(fd, "planned_send_date", values.planned_send_date);
    appendField(fd, "notes", values.notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    startTransition(async () => {
      const result = await createPaintOrder(fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    router.push("/paint-orders");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title="Who and what"
        description="Pick the painter (typically Metacoat A/S). The colour is an optional batch default — you set each frame's colour and scope as you add it."
      >
        <Field
          label="Supplier"
          htmlFor="paint-supplier"
          required
          error={errorField === "supplier_id" ? error : null}
        >
          <Select
            value={values.supplier_id}
            onValueChange={(v) => update("supplier_id", v)}
          >
            <SelectTrigger id="paint-supplier">
              <SelectValue placeholder="Pick a supplier…" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No active suppliers.
                </div>
              ) : (
                suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Batch default colour (optional)"
          htmlFor="paint-color"
          error={errorField === "color_id" ? error : null}
        >
          <Select
            value={values.color_id}
            onValueChange={(v) => update("color_id", v)}
          >
            <SelectTrigger id="paint-color">
              <SelectValue placeholder="No default — set per frame" />
            </SelectTrigger>
            <SelectContent>
              {colors.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <ColorSwatch hex={c.hex} label={c.name_en} />
                  {c.name_en}
                  {colorFinishLabel(c.ral_code, c.coating) ? (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      {colorFinishLabel(c.ral_code, c.coating)}
                    </span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Paint catalog part (optional)"
          htmlFor="paint-part"
          error={errorField === "paint_part_id" ? error : null}
        >
          <Select
            value={values.paint_part_id}
            onValueChange={(v) => update("paint_part_id", v)}
          >
            <SelectTrigger id="paint-part">
              <SelectValue placeholder="None — costed direct on this order" />
            </SelectTrigger>
            <SelectContent>
              {paintParts.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No Lakering parts found in the catalog.
                </div>
              ) : (
                paintParts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name_en}{" "}
                    <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                      ({p.internal_sku})
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title="Cost and schedule"
        description="Cost is per bike charged by the painter. Schedule fields are advisory; actual sent / received timestamps are stamped on status transitions."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label="Unit cost (per bike)"
            htmlFor="paint-cost"
            error={errorField === "unit_cost" ? error : null}
          >
            <Input
              id="paint-cost"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={values.unit_cost}
              onChange={(e) => update("unit_cost", e.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Field label="Currency" htmlFor="paint-currency">
            <Select
              value={values.unit_cost_currency}
              onValueChange={(v) => update("unit_cost_currency", v)}
            >
              <SelectTrigger id="paint-currency">
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
        <Field label="Planned send date" htmlFor="paint-send-date">
          <Input
            id="paint-send-date"
            type="date"
            value={values.planned_send_date}
            onChange={(e) => update("planned_send_date", e.target.value)}
          />
        </Field>
        <Field label="Notes" htmlFor="paint-notes">
          <Textarea
            id="paint-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Internal notes about this batch."
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
          {isPending ? "Creating…" : "Create paint order"}
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

