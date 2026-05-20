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
import { appendField } from "@/lib/forms";

import { createPO, updatePO } from "../_actions/save-po";

export type SupplierOption = {
  id: string;
  name: string;
  default_currency: string | null;
};

export type CurrencyOption = {
  code: string;
  name_en: string;
};

export type POFormValues = {
  supplier_id: string;
  order_date: string;
  expected_date: string;
  total_currency: string;
  notes: string;
};

/**
 * Create-mode default: today's date and DKK. Callers can override individual
 * fields (e.g. preselecting a supplier from a URL param).
 */
export function emptyPOForm(): POFormValues {
  return {
    supplier_id: "",
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: "",
    total_currency: "DKK",
    notes: "",
  };
}

type Props = {
  /** "create" submits to createPO + redirects; "edit" submits to updatePO. */
  mode: "create" | "edit";
  /** Required when mode = "edit". */
  poId?: string;
  initial: POFormValues;
  suppliers: SupplierOption[];
  currencies: CurrencyOption[];
  /**
   * Edit mode only: when lines already exist on the PO, the supplier can't be
   * swapped without invalidating already-priced lines. We lock the picker in
   * that case so the user gets an honest disabled control instead of a 500.
   */
  lockSupplier?: boolean;
};

export function POForm({
  mode,
  poId,
  initial,
  suppliers,
  currencies,
  lockSupplier = false,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<POFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function update<K extends keyof POFormValues>(
    key: K,
    value: POFormValues[K],
  ) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // On supplier change in create mode, mirror the supplier's preferred
      // currency into the total_currency picker. We only do this in create
      // mode — in edit mode the currency is part of the existing record and
      // shouldn't shift under the user's feet.
      if (key === "supplier_id" && mode === "create") {
        const s = suppliers.find((x) => x.id === value);
        if (s?.default_currency) {
          next.total_currency = s.default_currency;
        }
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
    appendField(fd, "supplier_id", values.supplier_id);
    appendField(fd, "order_date", values.order_date);
    appendField(fd, "expected_date", values.expected_date);
    appendField(fd, "total_currency", values.total_currency);
    appendField(fd, "notes", values.notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    start(async () => {
      const result =
        mode === "create"
          ? await createPO(fd)
          : await updatePO(poId ?? "", fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    if (mode === "edit" && poId) {
      router.push(`/purchase-orders/${poId}`);
    } else {
      router.push("/purchase-orders");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title="Identification"
        description={
          mode === "edit" && lockSupplier
            ? "Supplier is locked once lines exist — clear the lines first if you need to change it."
            : "Which supplier this PO is being placed with."
        }
      >
        <Field
          label="Supplier"
          htmlFor="po-supplier"
          required
          error={errorField === "supplier_id" ? error : null}
        >
          <Select
            value={values.supplier_id}
            onValueChange={(v) => update("supplier_id", v)}
            disabled={mode === "edit" && lockSupplier}
          >
            <SelectTrigger id="po-supplier">
              <SelectValue placeholder="Pick a supplier…" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  No active suppliers. Add one in Suppliers first.
                </div>
              ) : (
                suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.default_currency ? (
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        · {s.default_currency}
                      </span>
                    ) : null}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title="Dates"
        description="Order date is mandatory; expected date is advisory and used for the dashboard 'arriving soon' view."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Order date"
            htmlFor="po-order-date"
            required
            error={errorField === "order_date" ? error : null}
          >
            <Input
              id="po-order-date"
              type="date"
              value={values.order_date}
              onChange={(e) => update("order_date", e.target.value)}
              required
            />
          </Field>
          <Field label="Expected delivery" htmlFor="po-expected-date">
            <Input
              id="po-expected-date"
              type="date"
              value={values.expected_date}
              onChange={(e) => update("expected_date", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Billing"
        description="The total currency drives the PO's summed total. Individual lines can still be quoted in other currencies — those are converted to DKK via the per-line FX rate."
      >
        <Field
          label="Total currency"
          htmlFor="po-currency"
          required
          error={errorField === "total_currency" ? error : null}
        >
          <Select
            value={values.total_currency}
            onValueChange={(v) => update("total_currency", v)}
          >
            <SelectTrigger id="po-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code}
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    {c.name_en}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title="Notes"
        description="Internal — e.g. reference numbers, freight instructions, who at the supplier confirmed."
      >
        <Field label="Notes" htmlFor="po-notes">
          <Textarea
            id="po-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Free text. Cancellations append themselves here automatically."
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
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create draft PO"
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
