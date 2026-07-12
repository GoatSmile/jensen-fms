"use client";

import { useMemo, useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
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

import {
  createServiceAgreement,
  updateServiceAgreement,
} from "../_actions/save-service-agreement";

export type OrgOption = { id: string; name: string };
export type UnitOption = { id: string; name: string; organization_id: string };

export type ServiceAgreementFormValues = {
  organization_id: string;
  organization_unit_id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  covers_parts: boolean;
  covers_labor: boolean;
  has_gps: boolean;
  monthly_fee: string;
  fee_currency: string;
  notes: string;
};

export const EMPTY_AGREEMENT: ServiceAgreementFormValues = {
  organization_id: "",
  organization_unit_id: "",
  name: "",
  status: "active",
  start_date: "",
  end_date: "",
  covers_parts: true,
  covers_labor: true,
  has_gps: false,
  monthly_fee: "",
  fee_currency: "DKK",
  notes: "",
};

const NO_UNIT = "__org_wide__";

type Props = {
  mode: "create" | "edit";
  agreementId?: string;
  initial: ServiceAgreementFormValues;
  organizations: OrgOption[];
  units: UnitOption[];
};

export function ServiceAgreementForm({
  mode,
  agreementId,
  initial,
  organizations,
  units,
}: Props) {
  const t = useTranslations("serviceAgreementForm");
  const tCommon = useTranslations("common");
  const tSaStatus = useTranslations("saStatus");
  const router = useRouter();
  const [values, setValues] = useState<ServiceAgreementFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const orgUnits = useMemo(
    () => units.filter((u) => u.organization_id === values.organization_id),
    [units, values.organization_id],
  );

  function update<K extends keyof ServiceAgreementFormValues>(
    key: K,
    value: ServiceAgreementFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function onOrgChange(orgId: string) {
    setValues((prev) => ({
      ...prev,
      organization_id: orgId,
      organization_unit_id: "",
    }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "organization_id", values.organization_id);
    appendField(fd, "organization_unit_id", values.organization_unit_id);
    appendField(fd, "name", values.name);
    appendField(fd, "status", values.status);
    appendField(fd, "start_date", values.start_date);
    appendField(fd, "end_date", values.end_date);
    appendField(fd, "covers_parts", values.covers_parts);
    appendField(fd, "covers_labor", values.covers_labor);
    appendField(fd, "has_gps", values.has_gps);
    appendField(fd, "monthly_fee", values.monthly_fee);
    appendField(fd, "fee_currency", values.fee_currency);
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
          ? await createServiceAgreement(fd)
          : await updateServiceAgreement(agreementId!, fd);
      if (!r || r.ok) return;
      setError(r.error);
      setErrorField(r.field ?? null);
    });
  }

  function onCancel() {
    if (mode === "edit" && agreementId)
      router.push(`/service-agreements/${agreementId}`);
    else router.push("/service-agreements");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Section
        title={t("sectionScopeTitle")}
        description={t("sectionScopeDesc")}
      >
        <Field
          label={t("fldCustomer")}
          htmlFor="sa-org"
          required
          error={errorField === "organization_id" ? error : null}
        >
          <Combobox
            id="sa-org"
            value={values.organization_id}
            onValueChange={onOrgChange}
            options={organizations.map((o) => ({
              value: o.id,
              label: o.name,
            }))}
            placeholder={t("pickCustomer")}
            searchPlaceholder={t("searchCustomers")}
            emptyMessage={t("noCustomersMatch")}
          />
        </Field>
        <Field label={t("fldUnit")} htmlFor="sa-unit">
          <Select
            value={values.organization_unit_id || NO_UNIT}
            onValueChange={(v) =>
              update("organization_unit_id", v === NO_UNIT ? "" : v)
            }
            disabled={!values.organization_id || orgUnits.length === 0}
          >
            <SelectTrigger id="sa-unit">
              <SelectValue placeholder={t("wholeOrg")} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NO_UNIT}>{t("wholeOrg")}</SelectItem>
              {orgUnits.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title={t("sectionAgreement")}>
        <Field
          label={t("fldName")}
          htmlFor="sa-name"
          required
          error={errorField === "name" ? error : null}
        >
          <Input
            id="sa-name"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder={t("namePlaceholder")}
            autoFocus={mode === "create"}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("fldStatus")} htmlFor="sa-status">
            <Select
              value={values.status}
              onValueChange={(v) => update("status", v)}
            >
              <SelectTrigger id="sa-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{tSaStatus("active")}</SelectItem>
                <SelectItem value="expired">{tSaStatus("expired")}</SelectItem>
                <SelectItem value="cancelled">
                  {tSaStatus("cancelled")}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={t("fldStart")}
            htmlFor="sa-start"
            required
            error={errorField === "start_date" ? error : null}
          >
            <Input
              id="sa-start"
              type="date"
              value={values.start_date}
              onChange={(e) => update("start_date", e.target.value)}
            />
          </Field>
          <Field
            label={t("fldEnd")}
            htmlFor="sa-end"
            error={errorField === "end_date" ? error : null}
          >
            <Input
              id="sa-end"
              type="date"
              value={values.end_date}
              onChange={(e) => update("end_date", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section
        title={t("sectionCoverageTitle")}
        description={t("sectionCoverageDesc")}
      >
        <div className="flex flex-col gap-2">
          <Check
            id="sa-parts"
            label={t("checkParts")}
            checked={values.covers_parts}
            onChange={(v) => update("covers_parts", v)}
          />
          <Check
            id="sa-labor"
            label={t("checkLabour")}
            checked={values.covers_labor}
            onChange={(v) => update("covers_labor", v)}
          />
          <Check
            id="sa-gps"
            label={t("checkGps")}
            checked={values.has_gps}
            onChange={(v) => update("has_gps", v)}
          />
        </div>
        <p className="text-muted-foreground text-xs">{t("coverageHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={t("fldMonthlyFee")}
            htmlFor="sa-fee"
            error={errorField === "monthly_fee" ? error : null}
          >
            <Input
              id="sa-fee"
              inputMode="decimal"
              value={values.monthly_fee}
              onChange={(e) => update("monthly_fee", e.target.value)}
              placeholder={t("feePlaceholder")}
            />
          </Field>
          <Field label={t("fldCurrency")} htmlFor="sa-currency">
            <Input
              id="sa-currency"
              value={values.fee_currency}
              onChange={(e) =>
                update("fee_currency", e.target.value.toUpperCase())
              }
              maxLength={3}
              className="font-mono"
            />
          </Field>
        </div>
      </Section>

      <Section title={t("sectionNotesTitle")} description={t("sectionNotesDesc")}>
        <Field label={t("fldNotes")} htmlFor="sa-notes">
          <Textarea
            id="sa-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </Field>
      </Section>

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
            ? tCommon("saving")
            : mode === "create"
              ? t("createAgreement")
              : t("saveChanges")}
        </Button>
      </div>
    </form>
  );
}

function Section({
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

function Check({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="border-input text-primary focus-visible:ring-ring h-4 w-4 rounded border accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}
