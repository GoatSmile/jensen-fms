"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { FormSection } from "@/components/form-section";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  /** Supplier delivers duty-paid — new PO lines default to no import tax. */
  import_duty_prepaid_default: boolean;
  /** Language of the documents this supplier receives (paint orders today). */
  document_language: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_SUPPLIER_FORM: SupplierFormValues = {
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
  import_duty_prepaid_default: false,
  document_language: "en",
  notes: "",
  is_active: true,
};

// Radix Select can't hold an empty string — sentinel for "no default currency".
const NO_CURRENCY = "__none__";

type Mode = { kind: "create" } | { kind: "edit"; id: string };

type Props = {
  mode: Mode;
  /** Overrides only — unset fields fall back to EMPTY_SUPPLIER_FORM. */
  initial?: Partial<SupplierFormValues>;
  currencies: CurrencyOption[];
};

export function SupplierForm({ mode, initial, currencies }: Props) {
  const router = useRouter();
  const t = useTranslations("adminSuppliers");
  const tCommon = useTranslations("common");
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: SupplierFormValues = { ...EMPTY_SUPPLIER_FORM, ...initial };
  const [values, setValues] = useState<SupplierFormValues>(seed);
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
    if (values.import_duty_prepaid_default) {
      fd.set("import_duty_prepaid_default", "on");
    }
    appendField(fd, "document_language", values.document_language);
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

  // Everything past name / currency / terms / primary email is filled once
  // and rarely revisited — folded unless this supplier already has some.
  const hasMore = Boolean(
    seed.phone ||
      seed.website ||
      seed.email_secondary ||
      seed.address_line1 ||
      seed.address_line2 ||
      seed.zip_code ||
      seed.town ||
      seed.province ||
      seed.notes,
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection title={t("secMain")} description={t("secMainDesc")}>
        <Field label={t("fieldName")} htmlFor="sup-name">
          <Input
            id="sup-name"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder={t("namePlaceholder")}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("fieldCurrency")} htmlFor="sup-currency">
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
                  <span className="text-ink-3 italic">
                    {t("currencyUnspecified")}
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
          <Field label={t("fieldTerms")} htmlFor="sup-terms">
            <Input
              id="sup-terms"
              type="number"
              inputMode="numeric"
              value={values.payment_terms_days}
              onChange={(e) => update("payment_terms_days", e.target.value)}
              placeholder={t("termsPlaceholder")}
              className="max-w-[140px]"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-1">
          <Field label={t("docLanguageLabel")} htmlFor="sup-doc-lang">
            <Select
              value={values.document_language === "da" ? "da" : "en"}
              onValueChange={(v) => update("document_language", v)}
            >
              <SelectTrigger id="sup-doc-lang" className="max-w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("docLangEn")}</SelectItem>
                <SelectItem value="da">{t("docLangDa")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-ink-2 text-xs">{t("docLanguageHint")}</p>
        </div>

        <Field label={t("fieldEmailPrimary")} htmlFor="sup-email1">
          <Input
            id="sup-email1"
            type="email"
            value={values.email_primary}
            onChange={(e) => update("email_primary", e.target.value)}
            placeholder="sales@example.com"
            className="font-mono"
          />
        </Field>

        <div className="flex flex-col gap-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.import_duty_prepaid_default}
              onChange={(e) =>
                update("import_duty_prepaid_default", e.target.checked)
              }
              className="size-4"
            />
            {t("dutyPrepaidLabel")}
          </label>
          <p className="text-ink-2 pl-6 text-xs">{t("dutyPrepaidHint")}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.is_active}
            onChange={(e) => update("is_active", e.target.checked)}
            className="size-4"
          />
          {t("activeLabel")}
        </label>
      </FormSection>

      <FormSection
        title={t("secMore")}
        description={t("secMoreDesc")}
        collapsible
        defaultOpen={hasMore}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("fieldPhone")} htmlFor="sup-phone">
            <Input
              id="sup-phone"
              type="tel"
              value={values.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+45 12 34 56 78"
            />
          </Field>
          <Field label={t("fieldWebsite")} htmlFor="sup-website">
            <Input
              id="sup-website"
              type="url"
              value={values.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://example.com"
            />
          </Field>
        </div>

        <Field label={t("fieldEmailSecondary")} htmlFor="sup-email2">
          <Input
            id="sup-email2"
            type="email"
            value={values.email_secondary}
            onChange={(e) => update("email_secondary", e.target.value)}
            placeholder={t("optional")}
            className="font-mono"
          />
        </Field>

        <Field label={t("fieldAddr1")} htmlFor="sup-addr1">
          <Input
            id="sup-addr1"
            value={values.address_line1}
            onChange={(e) => update("address_line1", e.target.value)}
            placeholder={t("addr1Placeholder")}
          />
        </Field>
        <Field label={t("fieldAddr2")} htmlFor="sup-addr2">
          <Input
            id="sup-addr2"
            value={values.address_line2}
            onChange={(e) => update("address_line2", e.target.value)}
            placeholder={t("optional")}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("fieldZip")} htmlFor="sup-zip">
            <Input
              id="sup-zip"
              value={values.zip_code}
              onChange={(e) => update("zip_code", e.target.value)}
            />
          </Field>
          <Field label={t("fieldTown")} htmlFor="sup-town">
            <Input
              id="sup-town"
              value={values.town}
              onChange={(e) => update("town", e.target.value)}
            />
          </Field>
          <Field label={t("fieldProvince")} htmlFor="sup-province">
            <Input
              id="sup-province"
              value={values.province}
              onChange={(e) => update("province", e.target.value)}
              placeholder={t("optional")}
            />
          </Field>
        </div>

        <Field label={t("fieldCountry")} htmlFor="sup-country">
          <Select
            value={values.country_code || DEFAULT_COUNTRY_CODE}
            onValueChange={(v) => update("country_code", v)}
          >
            <SelectTrigger id="sup-country">
              <SelectValue placeholder={t("countryPlaceholder")} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectGroup>
                <SelectLabel>{t("countryCommon")}</SelectLabel>
                {countries.popular.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t("countryAll")}</SelectLabel>
                {countries.rest.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("fieldNotes")} htmlFor="sup-notes">
          <Textarea
            id="sup-notes"
            rows={2}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder={t("notesPlaceholder")}
          />
        </Field>
      </FormSection>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="bg-surface flex items-center justify-between gap-2 rounded-lg p-3">
        <span className="text-ink-2 text-xs">
          {savedAt
            ? t("savedAt", {
                time: new Date(savedAt).toLocaleTimeString("da-DK"),
              })
            : mode.kind === "create"
              ? t("notYetSaved")
              : t("upToDate")}
        </span>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline" disabled={pending}>
            <Link href="/admin/suppliers">{tCommon("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? tCommon("saving")
              : mode.kind === "create"
                ? t("addSupplier")
                : t("saveChanges")}
          </Button>
        </div>
      </div>
    </form>
  );
}
