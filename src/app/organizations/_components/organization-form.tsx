"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import {
  createOrganization,
  updateOrganization,
} from "../_actions/save-organization";

export type SegmentOption = {
  id: string;
  name_en: string;
};

export type CurrencyOption = {
  code: string;
};

export type VatCodeOption = {
  code: string;
  name_en: string;
};

export type OrganizationFormValues = {
  legal_name: string;
  display_name_en: string;
  display_name_da: string;
  customer_segment_id: string;
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

export const EMPTY_ORGANIZATION_SHELL: OrganizationFormValues = {
  legal_name: "",
  display_name_en: "",
  display_name_da: "",
  customer_segment_id: "",
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
  payment_terms_days: "30",
  default_vat_code: "",
  notes: "",
};

// Sentinel for "no default VAT code" so the Radix Select gets a non-empty
// string in the controlled input slot. Mapped back to "" on submit.
const NO_VAT_CODE = "__none__";

type Props = {
  mode: "create" | "edit";
  organizationId?: string;
  initial: OrganizationFormValues;
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
  const router = useRouter();
  const [values, setValues] = useState<OrganizationFormValues>(initial);
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
        title="Identification"
        description="The legal name is what appears on invoices. Display names are friendlier labels we can show on documents and the customer detail page."
      >
        <Field
          label="Legal name"
          htmlFor="org-legal-name"
          required
          error={errorField === "legal_name" ? error : null}
        >
          <Input
            id="org-legal-name"
            value={values.legal_name}
            onChange={(e) => update("legal_name", e.target.value)}
            placeholder="e.g. Rigshospitalet"
            required
            autoFocus={mode === "create"}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Display name (English)" htmlFor="org-display-en">
            <Input
              id="org-display-en"
              value={values.display_name_en}
              onChange={(e) => update("display_name_en", e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Visningsnavn (dansk)" htmlFor="org-display-da">
            <Input
              id="org-display-da"
              value={values.display_name_da}
              onChange={(e) => update("display_name_da", e.target.value)}
              placeholder="Valgfrit"
            />
          </Field>
        </div>
        <Field
          label="Segment"
          htmlFor="org-segment"
          required
          error={errorField === "customer_segment_id" ? error : null}
        >
          <Select
            value={values.customer_segment_id}
            onValueChange={(v) => update("customer_segment_id", v)}
          >
            <SelectTrigger id="org-segment">
              <SelectValue placeholder="Pick a segment…" />
            </SelectTrigger>
            <SelectContent>
              {segments.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title="Tax & business"
        description="Identifiers used on Danish invoicing and EAN-based public-sector billing."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="CVR number" htmlFor="org-cvr">
            <Input
              id="org-cvr"
              value={values.cvr_number}
              onChange={(e) => update("cvr_number", e.target.value)}
              placeholder="e.g. 12345678"
              className="font-mono"
            />
          </Field>
          <Field label="EAN number" htmlFor="org-ean">
            <Input
              id="org-ean"
              value={values.ean_number}
              onChange={(e) => update("ean_number", e.target.value)}
              placeholder="13-digit GLN"
              className="font-mono"
            />
          </Field>
          <Field label="VAT number" htmlFor="org-vat">
            <Input
              id="org-vat"
              value={values.vat_number}
              onChange={(e) => update("vat_number", e.target.value)}
              placeholder="e.g. DK12345678"
              className="font-mono"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Contact"
        description="Primary point of contact. Used for service updates and invoices."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Email"
            htmlFor="org-email"
            error={errorField === "email" ? error : null}
          >
            <Input
              id="org-email"
              type="email"
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="indkob@example.dk"
              className="font-mono"
            />
          </Field>
          <Field label="Phone" htmlFor="org-phone">
            <Input
              id="org-phone"
              type="tel"
              value={values.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+45 12 34 56 78"
            />
          </Field>
          <Field label="Website" htmlFor="org-website">
            <Input
              id="org-website"
              type="url"
              value={values.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://example.dk"
            />
          </Field>
          <Field label="Preferred language" htmlFor="org-lang">
            <Select
              value={values.preferred_language}
              onValueChange={(v) => update("preferred_language", v)}
            >
              <SelectTrigger id="org-lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="da">Dansk</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Address"
        description="Where bikes get delivered and invoices land. Public sector usually uses EAN billing anyway, but a fallback postal address is useful."
      >
        <Field label="Address line 1" htmlFor="org-addr1">
          <Input
            id="org-addr1"
            value={values.address_line1}
            onChange={(e) => update("address_line1", e.target.value)}
            placeholder="Street and number"
          />
        </Field>
        <Field label="Address line 2" htmlFor="org-addr2">
          <Input
            id="org-addr2"
            value={values.address_line2}
            onChange={(e) => update("address_line2", e.target.value)}
            placeholder="Att., department, floor — optional"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label="Postal code" htmlFor="org-zip">
            <Input
              id="org-zip"
              value={values.zip_code}
              onChange={(e) => update("zip_code", e.target.value)}
              placeholder="e.g. 2100"
              className="font-mono"
            />
          </Field>
          <Field label="City" htmlFor="org-city">
            <Input
              id="org-city"
              value={values.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="e.g. København Ø"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Country" htmlFor="org-country">
            <Select
              value={values.country_code || DEFAULT_COUNTRY_CODE}
              onValueChange={(v) => update("country_code", v)}
            >
              <SelectTrigger id="org-country">
                <SelectValue placeholder="Pick a country" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  <SelectLabel>Common</SelectLabel>
                  {groupedCountries().popular.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>All countries</SelectLabel>
                  {groupedCountries().rest.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field label="State / region" htmlFor="org-state">
            <Input
              id="org-state"
              value={values.state_province}
              onChange={(e) => update("state_province", e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Billing"
        description="Currency the customer is invoiced in. Payment terms default to net 30 — adjust per contract."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Billing currency" htmlFor="org-currency">
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
            label="Payment terms (days)"
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
              placeholder="30"
            />
          </Field>
          <Field label="Default VAT code" htmlFor="org-vatcode">
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
                <SelectItem value={NO_VAT_CODE}>None</SelectItem>
                {vatCodes.map((v) => (
                  <SelectItem key={v.code} value={v.code}>
                    {v.code} — {v.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Notes"
        description="Internal notes about this customer — not shown to them."
      >
        <Field label="Notes" htmlFor="org-notes">
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
              ? "Create customer"
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
