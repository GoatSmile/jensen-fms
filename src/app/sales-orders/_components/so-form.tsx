"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DeliveryWeekDateField } from "@/components/delivery-week-date-field";
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

import { createSO, updateSO } from "../_actions/save-so";

export type OrgOption = {
  id: string;
  name: string;
  default_vat_code: string | null;
  /** Customer's billing currency — seeds a new SO's currency. */
  billing_currency: string | null;
  /** Customer's preferred language — seeds a new SO's language. */
  preferred_language: "da" | "en";
};
export type OrgUnitOption = {
  id: string;
  organization_id: string;
  name: string;
};
export type ContactOption = {
  id: string;
  organization_id: string;
  label: string;
};
export type CurrencyOption = { code: string };

export type SOFormValues = {
  organization_id: string;
  organization_unit_id: string;
  contact_id: string;
  language: "da" | "en";
  order_date: string;
  requested_delivery_date: string;
  requested_delivery_precision: "exact" | "week";
  currency: string;
  notes: string;
};

const EMPTY_SO_FORM: SOFormValues = {
  organization_id: "",
  organization_unit_id: "",
  contact_id: "",
  language: "da",
  order_date: new Date().toISOString().slice(0, 10),
  requested_delivery_date: "",
  // New sales orders default to a week target — Dennis commits delivery as a
  // week, not a specific day. The user can still switch to an exact date.
  requested_delivery_precision: "week",
  currency: "DKK",
  notes: "",
};

const NO_UNIT = "__none__";
const NO_CONTACT = "__none__";

type Props = {
  mode: "create" | "edit";
  soId?: string;
  /** Overrides only — unset fields fall back to EMPTY_SO_FORM. */
  initial?: Partial<SOFormValues>;
  organizations: OrgOption[];
  units: OrgUnitOption[];
  contacts: ContactOption[];
  currencies: CurrencyOption[];
};

export function SOForm({
  mode,
  soId,
  initial,
  organizations,
  units,
  contacts,
  currencies,
}: Props) {
  const t = useTranslations("so");
  const tCommon = useTranslations("common");
  const router = useRouter();
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: SOFormValues = { ...EMPTY_SO_FORM, ...initial };
  const [values, setValues] = useState<SOFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unitsForOrg = useMemo(
    () => units.filter((u) => u.organization_id === values.organization_id),
    [units, values.organization_id],
  );
  const contactsForOrg = useMemo(
    () =>
      contacts.filter((c) => c.organization_id === values.organization_id),
    [contacts, values.organization_id],
  );

  function update<K extends keyof SOFormValues>(key: K, v: SOFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function onOrgChange(orgId: string) {
    update("organization_id", orgId);
    // Clear unit/contact when customer changes — they belong to the old org.
    update("organization_unit_id", "");
    update("contact_id", "");
    // On a NEW order, seed currency + language from the customer (an Iceland
    // export customer billed in EUR shouldn't default to DKK). In edit mode we
    // leave the existing choices alone — they may have been set deliberately.
    if (mode === "create") {
      const org = organizations.find((o) => o.id === orgId);
      if (org) {
        update("currency", org.billing_currency ?? "DKK");
        update("language", org.preferred_language);
      }
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "organization_id", values.organization_id);
    appendField(fd, "organization_unit_id", values.organization_unit_id);
    appendField(fd, "contact_id", values.contact_id);
    appendField(fd, "language", values.language);
    appendField(fd, "order_date", values.order_date);
    appendField(
      fd,
      "requested_delivery_date",
      values.requested_delivery_date,
    );
    appendField(
      fd,
      "requested_delivery_precision",
      values.requested_delivery_precision,
    );
    appendField(fd, "currency", values.currency);
    appendField(fd, "notes", values.notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    start(async () => {
      const r =
        mode === "create" ? await createSO(fd) : await updateSO(soId!, fd);
      if (!r || r.ok) {
        // createSO redirects; updateSO returns ok and we push back to detail.
        if (mode === "edit" && soId) router.push(`/sales-orders/${soId}`);
        return;
      }
      setError(r.error);
      setErrorField(r.field ?? null);
    });
  }

  const submitLabel = mode === "create" ? t("createDraft") : t("saveChanges");

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="so-org">
            {t("customer")} <span className="text-destructive">*</span>
          </Label>
          <Combobox
            id="so-org"
            value={values.organization_id}
            onValueChange={onOrgChange}
            options={organizations.map((o) => ({
              value: o.id,
              label: o.name,
              sublabel: o.default_vat_code,
            }))}
            placeholder={t("pickCustomerPlaceholder")}
            searchPlaceholder={t("searchCustomers")}
            emptyMessage={t("noCustomersMatch")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="so-unit">{t("subUnitOptional")}</Label>
          <Select
            value={
              values.organization_unit_id === "" ? NO_UNIT : values.organization_unit_id
            }
            onValueChange={(v) =>
              update("organization_unit_id", v === NO_UNIT ? "" : v)
            }
            disabled={!values.organization_id || unitsForOrg.length === 0}
          >
            <SelectTrigger id="so-unit">
              <SelectValue
                placeholder={
                  !values.organization_id
                    ? t("pickCustomerFirst")
                    : unitsForOrg.length === 0
                      ? t("noSubUnits")
                      : t("noSubUnit")
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_UNIT}>{t("noSubUnit")}</SelectItem>
              {unitsForOrg.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="so-contact">{t("contactOptional")}</Label>
          <Select
            value={values.contact_id === "" ? NO_CONTACT : values.contact_id}
            onValueChange={(v) =>
              update("contact_id", v === NO_CONTACT ? "" : v)
            }
            disabled={!values.organization_id || contactsForOrg.length === 0}
          >
            <SelectTrigger id="so-contact">
              <SelectValue
                placeholder={
                  !values.organization_id
                    ? t("pickCustomerFirst")
                    : contactsForOrg.length === 0
                      ? t("noContactsOnFile")
                      : t("noContact")
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CONTACT}>{t("noContact")}</SelectItem>
              {contactsForOrg.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="so-language">{t("language")}</Label>
          <Select
            value={values.language}
            onValueChange={(v) => update("language", v as "da" | "en")}
          >
            <SelectTrigger id="so-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="da">Dansk</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="so-order-date">
            {t("orderDate")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="so-order-date"
            type="date"
            value={values.order_date}
            onChange={(e) => update("order_date", e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="so-delivery-date">{t("expectedDelivery")}</Label>
          <DeliveryWeekDateField
            id="so-delivery-date"
            date={values.requested_delivery_date}
            precision={values.requested_delivery_precision}
            onChange={(date, precision) => {
              update("requested_delivery_date", date);
              update("requested_delivery_precision", precision);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="so-currency">{t("currency")}</Label>
          <Select
            value={values.currency}
            onValueChange={(v) => update("currency", v)}
          >
            <SelectTrigger id="so-currency">
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
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="so-notes">{t("notes")}</Label>
        <Textarea
          id="so-notes"
          rows={3}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder={t("notesPlaceholder")}
        />
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (mode === "edit" && soId) router.push(`/sales-orders/${soId}`);
            else router.push("/sales-orders");
          }}
          disabled={pending}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !values.organization_id}>
          {pending ? tCommon("saving") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
