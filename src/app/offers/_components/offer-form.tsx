"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
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
import { DEFAULT_OFFER_VALIDITY_DAYS } from "@/lib/offers/status";

import { createOffer, updateOffer } from "../_actions/save-offer";

export type OrgOption = {
  id: string;
  name: string;
  default_vat_code: string | null;
  billing_currency: string | null;
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

export type OfferFormValues = {
  organization_id: string;
  organization_unit_id: string;
  contact_id: string;
  language: "da" | "en";
  currency: string;
  expiry_date: string;
  notes: string;
};

// Module-local and NOT exported: a server page that imported this shell across
// the "use client" boundary would spread `{}` (see CLAUDE.md). The merge
// happens below, in the client.
const EMPTY_OFFER_FORM: OfferFormValues = {
  organization_id: "",
  organization_unit_id: "",
  contact_id: "",
  language: "da",
  currency: "DKK",
  // Blank means "decide at send" — markOfferSent fills it with today +
  // DEFAULT_OFFER_VALIDITY_DAYS. An offer is issued when it goes out, not when
  // it is typed, so dating it now would start the clock too early.
  expiry_date: "",
  notes: "",
};

const NO_UNIT = "__none__";
const NO_CONTACT = "__none__";

type Props = {
  mode: "create" | "edit";
  offerId?: string;
  /** Overrides only — unset fields fall back to the shell above. */
  initial?: Partial<OfferFormValues>;
  organizations: OrgOption[];
  units: OrgUnitOption[];
  contacts: ContactOption[];
  currencies: CurrencyOption[];
};

export function OfferForm({
  mode,
  offerId,
  initial,
  organizations,
  units,
  contacts,
  currencies,
}: Props) {
  const t = useTranslations("offers");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const seed: OfferFormValues = { ...EMPTY_OFFER_FORM, ...initial };
  const [values, setValues] = useState<OfferFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unitsForOrg = useMemo(
    () => units.filter((u) => u.organization_id === values.organization_id),
    [units, values.organization_id],
  );
  const contactsForOrg = useMemo(
    () => contacts.filter((c) => c.organization_id === values.organization_id),
    [contacts, values.organization_id],
  );

  function update<K extends keyof OfferFormValues>(
    key: K,
    v: OfferFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function onOrgChange(orgId: string) {
    update("organization_id", orgId);
    update("organization_unit_id", "");
    update("contact_id", "");
    // On a NEW offer, seed currency + language from the customer. The document
    // language is a fact about the RECIPIENT, never the UI locale.
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
    appendField(fd, "currency", values.currency);
    appendField(fd, "expiry_date", values.expiry_date);
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
        mode === "create"
          ? await createOffer(fd)
          : await updateOffer(offerId!, fd);
      // Both redirect on success; only a failure comes back.
      if (!r || r.ok) return;
      setError(r.error);
      setErrorField(r.field ?? null);
    });
  }

  const submitLabel = mode === "create" ? t("createDraft") : t("saveChanges");

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-org">
            <span>
              {t("customer")} <span className="text-destructive">*</span>
            </span>
          </Label>
          <Combobox
            id="offer-org"
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
          <Label htmlFor="offer-unit">{t("subUnitOptional")}</Label>
          <Select
            value={
              values.organization_unit_id === ""
                ? NO_UNIT
                : values.organization_unit_id
            }
            onValueChange={(v) =>
              update("organization_unit_id", v === NO_UNIT ? "" : v)
            }
            disabled={!values.organization_id || unitsForOrg.length === 0}
          >
            <SelectTrigger id="offer-unit">
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
          <Label htmlFor="offer-contact">{t("contactOptional")}</Label>
          <Select
            value={values.contact_id === "" ? NO_CONTACT : values.contact_id}
            onValueChange={(v) =>
              update("contact_id", v === NO_CONTACT ? "" : v)
            }
            disabled={!values.organization_id || contactsForOrg.length === 0}
          >
            <SelectTrigger id="offer-contact">
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
          <Label
            htmlFor="offer-language"
            className="flex-col items-start gap-0.5"
          >
            {t("documentLanguage")}
            <span className="text-muted-foreground block text-xs">
              {t("documentLanguageHint")}
            </span>
          </Label>
          <Select
            value={values.language}
            onValueChange={(v) => update("language", v as "da" | "en")}
          >
            <SelectTrigger id="offer-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="da">Dansk</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="offer-expiry"
            className="flex-col items-start gap-0.5"
          >
            {t("expiryOptional")}
            <span className="text-muted-foreground block text-xs">
              {t("expiryHint", { days: DEFAULT_OFFER_VALIDITY_DAYS })}
            </span>
          </Label>
          <Input
            id="offer-expiry"
            type="date"
            value={values.expiry_date}
            onChange={(e) => update("expiry_date", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-currency">{t("currency")}</Label>
          <Select
            value={values.currency}
            onValueChange={(v) => update("currency", v)}
          >
            <SelectTrigger id="offer-currency">
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
        <Label htmlFor="offer-notes" className="flex-col items-start gap-0.5">
          {t("notes")}
          <span className="text-muted-foreground block text-xs">
            {t("notesHint")}
          </span>
        </Label>
        <Textarea
          id="offer-notes"
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
            if (mode === "edit" && offerId) router.push(`/offers/${offerId}`);
            else router.push("/offers");
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
