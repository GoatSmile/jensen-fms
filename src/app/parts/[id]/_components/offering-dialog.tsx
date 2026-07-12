"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  createOffering,
  updateOffering,
} from "../_actions/offerings";

export type SupplierOption = {
  id: string;
  name: string;
  defaultCurrency: string | null;
};
export type CurrencyOption = { code: string; name_en: string };

export type OfferingValues = {
  supplierSku: string;
  defaultPurchasePrice: string;
  defaultPurchaseCurrency: string;
  minimumOrderQuantity: string;
  leadTimeDays: string;
  isPreferred: boolean;
  notes: string;
};

export const EMPTY_OFFERING_VALUES: OfferingValues = {
  supplierSku: "",
  defaultPurchasePrice: "",
  defaultPurchaseCurrency: "",
  minimumOrderQuantity: "",
  leadTimeDays: "",
  isPreferred: false,
  notes: "",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partId: string;
  /** Edit mode: existing offering. Add mode: null. */
  offeringId?: string | null;
  /** Pre-existing supplier (locked when editing). */
  supplierId: string;
  /** Lock the supplier picker (edit mode). */
  lockSupplier: boolean;
  /** Suppliers available to choose from in add mode. Already-offered suppliers
   *  should be filtered out by the caller. */
  suppliers: SupplierOption[];
  currencies: CurrencyOption[];
  initial: OfferingValues;
};

export function OfferingDialog({
  open,
  onOpenChange,
  partId,
  offeringId,
  supplierId: initialSupplierId,
  lockSupplier,
  suppliers,
  currencies,
  initial,
}: Props) {
  const t = useTranslations("partDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  // Parent re-keys this component per Add/Edit click, so each open is a fresh
  // mount — no need to reset state on `open` changes.
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [values, setValues] = useState<OfferingValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = !!offeringId;

  function update<K extends keyof OfferingValues>(key: K, v: OfferingValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errorField) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("supplier_sku", values.supplierSku);
    fd.append("default_purchase_price", values.defaultPurchasePrice);
    fd.append("default_purchase_currency", values.defaultPurchaseCurrency);
    fd.append("minimum_order_quantity", values.minimumOrderQuantity);
    fd.append("lead_time_days", values.leadTimeDays);
    fd.append("notes", values.notes);
    if (values.isPreferred) fd.append("is_preferred", "on");
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    startTransition(async () => {
      const result = isEdit
        ? await updateOffering(partId, offeringId!, fd)
        : await createOffering(partId, supplierId, fd);
      if (!result.ok) {
        setError(result.error);
        setErrorField(result.field ?? null);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const submitLabel = isEdit ? t("saveChanges") : t("addOffering");
  const supplierName =
    suppliers.find((s) => s.id === supplierId)?.name ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t("editOffering") : t("addSupplierOffering")}
            </DialogTitle>
            <DialogDescription>
              {t("offeringDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="offering-supplier">{t("supplier")}</Label>
            {lockSupplier ? (
              <p className="bg-muted text-muted-foreground rounded-md border px-3 py-2 text-sm">
                {supplierName}
              </p>
            ) : (
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="offering-supplier">
                  <SelectValue placeholder={t("pickSupplier")} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="text-muted-foreground p-2 text-xs">
                      {t("allSuppliersHaveOffering")}
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
            )}
            {errorField === "supplier_id" && error ? (
              <p className="text-destructive text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="offering-sku">{t("supplierSku")}</Label>
            <Input
              id="offering-sku"
              value={values.supplierSku}
              onChange={(e) => update("supplierSku", e.target.value)}
              placeholder="e.g. JP-AART000162"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("purchasePrice")}
              htmlFor="offering-price"
              error={errorField === "default_purchase_price" ? error : null}
            >
              <Input
                id="offering-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.0001"
                value={values.defaultPurchasePrice}
                onChange={(e) =>
                  update("defaultPurchasePrice", e.target.value)
                }
              />
            </Field>
            <Field label={t("currency")} htmlFor="offering-currency">
              <Select
                value={values.defaultPurchaseCurrency}
                onValueChange={(v) => update("defaultPurchaseCurrency", v)}
              >
                <SelectTrigger id="offering-currency">
                  <SelectValue placeholder="—" />
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
              label={t("moq")}
              htmlFor="offering-moq"
              error={
                errorField === "minimum_order_quantity" ? error : null
              }
            >
              <Input
                id="offering-moq"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                value={values.minimumOrderQuantity}
                onChange={(e) =>
                  update("minimumOrderQuantity", e.target.value)
                }
              />
            </Field>
            <Field
              label={t("leadTimeDays")}
              htmlFor="offering-lead"
              error={errorField === "lead_time_days" ? error : null}
            >
              <Input
                id="offering-lead"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={values.leadTimeDays}
                onChange={(e) => update("leadTimeDays", e.target.value)}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.isPreferred}
              onChange={(e) => update("isPreferred", e.target.checked)}
              className="size-4"
            />
            {t("markPreferred")}
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="offering-notes">{t("thNotes")}</Label>
            <Textarea
              id="offering-notes"
              rows={2}
              value={values.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder={t("offeringNotesPlaceholder")}
            />
          </div>

          {error && !errorField ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                (!isEdit && !supplierId)
              }
            >
              {isPending ? tCommon("saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

