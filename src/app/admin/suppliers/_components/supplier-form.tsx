"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appendField } from "@/lib/forms";
import { DEFAULT_COUNTRY_CODE, groupedCountries } from "@/lib/countries";

import { createSupplier, updateSupplier } from "../_actions/manage-suppliers";

export type CurrencyOption = { code: string };

export type SupplierFormValues = {
  name: string;
  address_line1: string;
  address_line2: string;
  zip_code: string;
  town: string;
  province: string;
  country_code: string;
  phone: string;
  email_primary: string;
  email_secondary: string;
  website: string;
  default_currency: string;
  payment_terms_days: string;
  notes: string;
  is_active: boolean;
};

export const EMPTY_SUPPLIER_FORM: SupplierFormValues = {
  name: "",
  address_line1: "",
  address_line2: "",
  zip_code: "",
  town: "",
  province: "",
  country_code: DEFAULT_COUNTRY_CODE,
  phone: "",
  email_primary: "",
  email_secondary: "",
  website: "",
  default_currency: "",
  payment_terms_days: "",
  notes: "",
  is_active: true,
};

// Radix Select can't hold an empty string — sentinel for "no default currency".
const NO_CURRENCY = "__none__";

type Mode = { kind: "create" } | { kind: "edit"; id: string };

type Props = {
  mode: Mode;
  initial: SupplierFormValues;
  currencies: CurrencyOption[];
};

export function SupplierForm({ mode, initial, currencies }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<SupplierFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const countries = groupedCountries();

  function update<K extends keyof SupplierFormValues>(
    key: K,
    value: SupplierFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "name", values.name.trim());
    appendField(fd, "address_line1", values.address_line1.trim());
    appendField(fd, "address_line2", values.address_line2.trim());
    appendField(fd, "zip_code", values.zip_code.trim());
    appendField(fd, "town", values.town.trim());
    appendField(fd, "province", values.province.trim());
    appendField(fd, "country_code", values.country_code.trim());
    appendField(fd, "phone", values.phone.trim());
    appendField(fd, "email_primary", values.email_primary.trim());
    appendField(fd, "email_secondary", values.email_secondary.trim());
    appendField(fd, "website", values.website.trim());
    appendField(
      fd,
      "default_currency",
      values.default_currency === NO_CURRENCY ? "" : values.default_currency,
    );
    appendField(fd, "payment_terms_days", values.payment_terms_days.trim());
    appendField(fd, "notes", values.notes.trim());
    if (values.is_active) fd.set("is_active", "on");
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "create"
          ? await createSupplier(fd)
          : await updateSupplier(mode.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (mode.kind === "create") {
        router.push("/admin/suppliers");
        router.refresh();
      } else {
        setSavedAt(new Date().toISOString());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Supplier name" htmlFor="sup-name">
        <Input
          id="sup-name"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="e.g. Eastek HK"
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Default currency" htmlFor="sup-currency">
          <Select
            value={
              values.default_currency === ""
                ? NO_CURRENCY
                : values.default_currency
            }
            onValueChange={(v) => update("default_currency", v)}
          >
            <SelectTrigger id="sup-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CURRENCY}>
                <span className="text-muted-foreground italic">
                  Unspecified
                </span>
              </SelectItem>
              {currencies.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Payment terms (days)" htmlFor="sup-terms">
          <Input
            id="sup-terms"
            type="number"
            inputMode="numeric"
            value={values.payment_terms_days}
            onChange={(e) => update("payment_terms_days", e.target.value)}
            placeholder="e.g. 30"
            className="max-w-[140px]"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Phone" htmlFor="sup-phone">
          <Input
            id="sup-phone"
            type="tel"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+45 12 34 56 78"
          />
        </Field>
        <Field label="Website" htmlFor="sup-website">
          <Input
            id="sup-website"
            type="url"
            value={values.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder="https://example.com"
          />
        </Field>
        <Field label="Email (primary)" htmlFor="sup-email1">
          <Input
            id="sup-email1"
            type="email"
            value={values.email_primary}
            onChange={(e) => update("email_primary", e.target.value)}
            placeholder="sales@example.com"
            className="font-mono"
          />
        </Field>
        <Field label="Email (secondary)" htmlFor="sup-email2">
          <Input
            id="sup-email2"
            type="email"
            value={values.email_secondary}
            onChange={(e) => update("email_secondary", e.target.value)}
            placeholder="Optional"
            className="font-mono"
          />
        </Field>
      </div>

      <Field label="Address line 1" htmlFor="sup-addr1">
        <Input
          id="sup-addr1"
          value={values.address_line1}
          onChange={(e) => update("address_line1", e.target.value)}
          placeholder="Street and number"
        />
      </Field>
      <Field label="Address line 2" htmlFor="sup-addr2">
        <Input
          id="sup-addr2"
          value={values.address_line2}
          onChange={(e) => update("address_line2", e.target.value)}
          placeholder="Optional"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Zip code" htmlFor="sup-zip">
          <Input
            id="sup-zip"
            value={values.zip_code}
            onChange={(e) => update("zip_code", e.target.value)}
          />
        </Field>
        <Field label="Town" htmlFor="sup-town">
          <Input
            id="sup-town"
            value={values.town}
            onChange={(e) => update("town", e.target.value)}
          />
        </Field>
        <Field label="Province / region" htmlFor="sup-province">
          <Input
            id="sup-province"
            value={values.province}
            onChange={(e) => update("province", e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>

      <Field label="Country" htmlFor="sup-country">
        <Select
          value={values.country_code || DEFAULT_COUNTRY_CODE}
          onValueChange={(v) => update("country_code", v)}
        >
          <SelectTrigger id="sup-country">
            <SelectValue placeholder="Pick a country" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectGroup>
              <SelectLabel>Common</SelectLabel>
              {countries.popular.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>All countries</SelectLabel>
              {countries.rest.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Notes" htmlFor="sup-notes">
        <Textarea
          id="sup-notes"
          rows={2}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Optional — internal."
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
          className="size-4"
        />
        Active (visible in supplier pickers)
      </label>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="bg-card flex items-center justify-between gap-2 rounded-md border p-3">
        <span className="text-muted-foreground text-xs">
          {savedAt
            ? `Saved · ${new Date(savedAt).toLocaleTimeString("da-DK")}`
            : mode.kind === "create"
              ? "Not yet saved"
              : "Up to date"}
        </span>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline" disabled={pending}>
            <Link href="/admin/suppliers">Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode.kind === "create"
                ? "Add supplier"
                : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

