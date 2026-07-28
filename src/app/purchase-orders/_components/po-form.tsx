"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { FormSection } from "@/components/form-section";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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

// `emptyPOForm` lives in /new/page.tsx — it's a factory and Next.js can't
// import a function from a "use client" file into a Server Component.

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
  const t = useTranslations("po");
  const tCommon = useTranslations("common");
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
        title={t("identificationTitle")}
        description={
          mode === "edit" && lockSupplier
            ? t("identificationDescLocked")
            : t("identificationDesc")
        }
      >
        <Field
          label={t("supplier")}
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
              <SelectValue placeholder={t("pickSupplierPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {suppliers.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  {t("noActiveSuppliers")}
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

      <FormSection title={t("datesTitle")} description={t("datesDesc")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("orderDate")}
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
          <Field label={t("expectedDelivery")} htmlFor="po-expected-date">
            <Input
              id="po-expected-date"
              type="date"
              value={values.expected_date}
              onChange={(e) => update("expected_date", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title={t("billingTitle")} description={t("billingDesc")}>
        <Field
          label={t("totalCurrency")}
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

      <FormSection title={t("notesTitle")} description={t("notesDesc")}>
        <Field label={t("notes")} htmlFor="po-notes">
          <Textarea
            id="po-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder={t("notesPlaceholder")}
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
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? mode === "create"
              ? t("creating")
              : tCommon("saving")
            : mode === "create"
              ? t("createDraftPo")
              : t("saveChanges")}
        </Button>
      </div>
    </form>
  );
}

