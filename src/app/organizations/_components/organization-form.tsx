"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { FormSection } from "@/components/form-section";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

import { localizedName } from "@/i18n/vocab";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";
import { DEFAULT_COUNTRY_CODE, groupedCountries } from "@/lib/countries";
import { DEFAULT_PAYMENT_TERMS_DAYS } from "@/lib/invoicing/status";

import {
  createOrganization,
  updateOrganization,
} from "../_actions/save-organization";

export type SegmentOption = {
  id: string;
  name_en: string;
  name_da?: string | null;
};

export type CurrencyOption = {
  code: string;
};

export type VatCodeOption = {
  code: string;
  name_en: string;
  name_da?: string | null;
};

export type OrganizationFormValues = {
  legal_name: string;
  display_name_en: string;
  display_name_da: string;
  customer_segment_id: string;
  lifecycle_stage: string;
  preferred_language: string;
  cvr_number: string;
  ean_number: string;
  vat_number: string;
  address_line1: string;
  address_line2: string;
  zip_code: string;
  city: string;
  state_province: string;
  country_code: string;
  phone: string;
  email: string;
  website: string;
  billing_currency: string;
  payment_terms_days: string;
  default_vat_code: string;
  notes: string;
};

const EMPTY_ORGANIZATION_SHELL: OrganizationFormValues = {
  legal_name: "",
  display_name_en: "",
  display_name_da: "",
  customer_segment_id: "",
  lifecycle_stage: "customer",
  preferred_language: "da",
  cvr_number: "",
  ean_number: "",
  vat_number: "",
  address_line1: "",
  address_line2: "",
  zip_code: "",
  city: "",
  state_province: "",
  country_code: "DK",
  phone: "",
  email: "",
  website: "",
  billing_currency: "DKK",
  // Net 14 is the schema default (migration 01) and what invoicing falls back
  // to, so the create form must not offer a different number.
  payment_terms_days: String(DEFAULT_PAYMENT_TERMS_DAYS),
  default_vat_code: "",
  notes: "",
};

// Sentinel for "no default VAT code" so the Radix Select gets a non-empty
// string in the controlled input slot. Mapped back to "" on submit.
const NO_VAT_CODE = "__none__";

type Props = {
  mode: "create" | "edit";
  organizationId?: string;
  /** Overrides only — unset fields fall back to EMPTY_ORGANIZATION_SHELL. */
  initial?: Partial<OrganizationFormValues>;
  segments: SegmentOption[];
  currencies: CurrencyOption[];
  vatCodes: VatCodeOption[];
};

export function OrganizationForm({
  mode,
  organizationId,
  initial,
  segments,
  currencies,
  vatCodes,
}: Props) {
  const t = useTranslations("customerForm");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("lang");
  const locale = useLocale();
  const router = useRouter();
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: OrganizationFormValues = {
    ...EMPTY_ORGANIZATION_SHELL,
    ...initial,
  };
  const [values, setValues] = useState<OrganizationFormValues>(seed);

  // A section opens on arrival only if this record already has something in
  // it: an edit form shows what is filled, a create form shows what is
  // required. `seed`, not `values` — this is a mount-time default, not a
  // rule that should re-fold the section under the user as they type.
  const hasTax = Boolean(
    seed.cvr_number || seed.ean_number || seed.vat_number,
  );
  const hasContact = Boolean(seed.email || seed.phone || seed.website);
  const hasAddress = Boolean(
    seed.address_line1 ||
      seed.address_line2 ||
      seed.zip_code ||
      seed.city ||
      seed.state_province,
  );
  // Currency and terms carry defaults, so "filled" here means "moved off
  // them" — otherwise billing would be open on every customer. Compare
  // against the SHELL, never a literal: this read "!== 30" while the schema
  // default (and 531 of 535 real customers) sat on 14, so every record in
  // prod opened this section. A blank terms field is untouched, not content.
  const hasBilling = Boolean(
    seed.default_vat_code ||
      seed.billing_currency !== EMPTY_ORGANIZATION_SHELL.billing_currency ||
      (seed.payment_terms_days !== "" &&
        seed.payment_terms_days !==
          EMPTY_ORGANIZATION_SHELL.payment_terms_days),
  );
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof OrganizationFormValues>(
    key: K,
    value: OrganizationFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "legal_name", values.legal_name);
    appendField(fd, "display_name_en", values.display_name_en);
    appendField(fd, "display_name_da", values.display_name_da);
    appendField(fd, "customer_segment_id", values.customer_segment_id);
    appendField(fd, "lifecycle_stage", values.lifecycle_stage);
    appendField(fd, "preferred_language", values.preferred_language);
    appendField(fd, "cvr_number", values.cvr_number);
    appendField(fd, "ean_number", values.ean_number);
    appendField(fd, "vat_number", values.vat_number);
    appendField(fd, "address_line1", values.address_line1);
    appendField(fd, "address_line2", values.address_line2);
    appendField(fd, "zip_code", values.zip_code);
    appendField(fd, "city", values.city);
    appendField(fd, "state_province", values.state_province);
    appendField(fd, "country_code", values.country_code);
    appendField(fd, "phone", values.phone);
    appendField(fd, "email", values.email);
    appendField(fd, "website", values.website);
    appendField(fd, "billing_currency", values.billing_currency);
    appendField(fd, "payment_terms_days", values.payment_terms_days);
    appendField(
      fd,
      "default_vat_code",
      values.default_vat_code === NO_VAT_CODE ? "" : values.default_vat_code,
    );
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
          ? await createOrganization(fd)
          : await updateOrganization(organizationId!, fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    if (mode === "edit" && organizationId)
      router.push(`/organizations/${organizationId}`);
    else router.push("/organizations");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title={t("secIdentification")}
        description={t("secIdentificationDesc")}
      >
        <Field
          label={t("fldLegalName")}
          htmlFor="org-legal-name"
          required
          error={errorField === "legal_name" ? error : null}
        >
          <Input
            id="org-legal-name"
            value={values.legal_name}
            onChange={(e) => update("legal_name", e.target.value)}
            placeholder={t("legalNamePlaceholder")}
            required
            autoFocus={mode === "create"}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("fldDisplayEn")} htmlFor="org-display-en">
            <Input
              id="org-display-en"
              value={values.display_name_en}
              onChange={(e) => update("display_name_en", e.target.value)}
              placeholder={t("displayEnPlaceholder")}
            />
          </Field>
          <Field label={t("fldDisplayDa")} htmlFor="org-display-da">
            <Input
              id="org-display-da"
              value={values.display_name_da}
              onChange={(e) => update("display_name_da", e.target.value)}
              placeholder={t("displayDaPlaceholder")}
            />
          </Field>
        </div>
        <Field
          label={t("fldSegment")}
          htmlFor="org-segment"
          required
          error={errorField === "customer_segment_id" ? error : null}
        >
          <Select
            value={values.customer_segment_id}
            onValueChange={(v) => update("customer_segment_id", v)}
          >
            <SelectTrigger id="org-segment">
              <SelectValue placeholder={t("pickSegment")} />
            </SelectTrigger>
            <SelectContent>
              {segments.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {localizedName(locale, s.name_en, s.name_da)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={t("fldLifecycle")}
          htmlFor="org-stage"
          error={errorField === "lifecycle_stage" ? error : null}
        >
          <Select
            value={values.lifecycle_stage}
            onValueChange={(v) => update("lifecycle_stage", v)}
          >
            <SelectTrigger id="org-stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">{t("lifecycleCustomer")}</SelectItem>
              <SelectItem value="prospect">{t("lifecycleProspect")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title={t("secTax")}
        description={t("secTaxDesc")}
        collapsible
        defaultOpen={hasTax}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("fldCvr")} htmlFor="org-cvr">
            <Input
              id="org-cvr"
              value={values.cvr_number}
              onChange={(e) => update("cvr_number", e.target.value)}
              placeholder={t("cvrPlaceholder")}
              className="font-mono"
            />
          </Field>
          <Field label={t("fldEan")} htmlFor="org-ean">
            <Input
              id="org-ean"
              value={values.ean_number}
              onChange={(e) => update("ean_number", e.target.value)}
              placeholder={t("eanPlaceholder")}
              className="font-mono"
            />
          </Field>
          <Field label={t("fldVat")} htmlFor="org-vat">
            <Input
              id="org-vat"
              value={values.vat_number}
              onChange={(e) => update("vat_number", e.target.value)}
              placeholder={t("vatPlaceholder")}
              className="font-mono"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title={t("secContact")}
        description={t("secContactDesc")}
        collapsible
        defaultOpen={hasContact}
        forceOpen={errorField === "email" || errorField === "website"}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={t("fldEmail")}
            htmlFor="org-email"
            error={errorField === "email" ? error : null}
          >
            <Input
              id="org-email"
              type="email"
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="font-mono"
            />
          </Field>
          <Field label={t("fldPhone")} htmlFor="org-phone">
            <Input
              id="org-phone"
              type="tel"
              value={values.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder={t("phonePlaceholder")}
            />
          </Field>
          <Field
            label={t("fldWebsite")}
            htmlFor="org-website"
            error={errorField === "website" ? error : null}
          >
            <Input
              id="org-website"
              type="url"
              value={values.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder={t("websitePlaceholder")}
            />
          </Field>
          <Field label={t("fldPreferredLang")} htmlFor="org-lang">
            <Select
              value={values.preferred_language}
              onValueChange={(v) => update("preferred_language", v)}
            >
              <SelectTrigger id="org-lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="da">{tLang("da")}</SelectItem>
                <SelectItem value="en">{tLang("en")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection
        title={t("secAddress")}
        description={t("secAddressDesc")}
        collapsible
        defaultOpen={hasAddress}
      >
        <Field label={t("fldAddr1")} htmlFor="org-addr1">
          <Input
            id="org-addr1"
            value={values.address_line1}
            onChange={(e) => update("address_line1", e.target.value)}
            placeholder={t("addr1Placeholder")}
          />
        </Field>
        <Field label={t("fldAddr2")} htmlFor="org-addr2">
          <Input
            id="org-addr2"
            value={values.address_line2}
            onChange={(e) => update("address_line2", e.target.value)}
            placeholder={t("addr2Placeholder")}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label={t("fldZip")} htmlFor="org-zip">
            <Input
              id="org-zip"
              value={values.zip_code}
              onChange={(e) => update("zip_code", e.target.value)}
              placeholder={t("zipPlaceholder")}
              className="font-mono"
            />
          </Field>
          <Field label={t("fldCity")} htmlFor="org-city">
            <Input
              id="org-city"
              value={values.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder={t("cityPlaceholder")}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("fldCountry")} htmlFor="org-country">
            <Select
              value={values.country_code || DEFAULT_COUNTRY_CODE}
              onValueChange={(v) => update("country_code", v)}
            >
              <SelectTrigger id="org-country">
                <SelectValue placeholder={t("pickCountry")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  <SelectLabel>{t("countryCommon")}</SelectLabel>
                  {groupedCountries().popular.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{t("countryAll")}</SelectLabel>
                  {groupedCountries().rest.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("fldState")} htmlFor="org-state">
            <Input
              id="org-state"
              value={values.state_province}
              onChange={(e) => update("state_province", e.target.value)}
              placeholder={t("statePlaceholder")}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title={t("secBilling")}
        description={t("secBillingDesc")}
        collapsible
        defaultOpen={hasBilling}
        forceOpen={errorField === "payment_terms_days"}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("fldBillingCurrency")} htmlFor="org-currency">
            <Select
              value={values.billing_currency}
              onValueChange={(v) => update("billing_currency", v)}
            >
              <SelectTrigger id="org-currency">
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
          <Field
            label={t("fldPaymentTerms")}
            htmlFor="org-terms"
            error={errorField === "payment_terms_days" ? error : null}
          >
            <Input
              id="org-terms"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={values.payment_terms_days}
              onChange={(e) => update("payment_terms_days", e.target.value)}
              placeholder={t("paymentTermsPlaceholder")}
            />
          </Field>
          <Field label={t("fldDefaultVat")} htmlFor="org-vatcode">
            <Select
              value={
                values.default_vat_code === "" ? NO_VAT_CODE : values.default_vat_code
              }
              onValueChange={(v) => update("default_vat_code", v)}
            >
              <SelectTrigger id="org-vatcode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VAT_CODE}>{t("vatNone")}</SelectItem>
                {vatCodes.map((v) => (
                  <SelectItem key={v.code} value={v.code}>
                    {v.code} — {localizedName(locale, v.name_en, v.name_da)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection
        title={t("secNotes")}
        description={t("secNotesDesc")}
        collapsible
        defaultOpen={Boolean(seed.notes)}
      >
        <Field label={t("fldNotes")} htmlFor="org-notes">
          <Textarea
            id="org-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </Field>
      </FormSection>

      {error && !errorField ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="border-rule flex justify-end gap-2 border-t pt-4">
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
            ? tCommon("saving")
            : mode === "create"
              ? t("createCustomer")
              : t("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
