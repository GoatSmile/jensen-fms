"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appendField } from "@/lib/forms";

import { saveEconomicSettings } from "../_actions/save-settings";
import {
  testEconomicConnection,
  type EconomicProbe,
} from "../_actions/test-economic";

type Props = {
  initialEnabled: boolean;
  initialJournalNumber: string;
  initialRevenueAccount: string;
  initialVatCode: string;
  initialCustomerGroup: string;
  initialVatZone: string;
  initialPaymentTerms: string;
  tokensReady: boolean;
};

/**
 * e-conomic accounting config. Tokens are env-var secrets; this card holds
 * the operational numbers (journal, revenue account, VAT code, customer
 * vocabularies). "Test connection" reads /self + journals so the owner can
 * copy the right numbers instead of guessing.
 */
export function EconomicSettingsForm({
  initialEnabled,
  initialJournalNumber,
  initialRevenueAccount,
  initialVatCode,
  initialCustomerGroup,
  initialVatZone,
  initialPaymentTerms,
  tokensReady,
}: Props) {
  const t = useTranslations("adminSettings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [journalNumber, setJournalNumber] = useState(initialJournalNumber);
  const [revenueAccount, setRevenueAccount] = useState(initialRevenueAccount);
  const [vatCode, setVatCode] = useState(initialVatCode);
  const [customerGroup, setCustomerGroup] = useState(initialCustomerGroup);
  const [vatZone, setVatZone] = useState(initialVatZone);
  const [paymentTerms, setPaymentTerms] = useState(initialPaymentTerms);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [probe, setProbe] = useState<EconomicProbe | null>(null);
  const [pending, start] = useTransition();
  const [probing, startProbe] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    if (enabled) fd.set("economic_enabled", "on");
    appendField(fd, "economic_journal_number", journalNumber.trim());
    appendField(fd, "economic_revenue_account", revenueAccount.trim());
    appendField(fd, "economic_vat_code", vatCode.trim());
    appendField(fd, "economic_customer_group", customerGroup.trim());
    appendField(fd, "economic_vat_zone", vatZone.trim());
    appendField(fd, "economic_payment_terms", paymentTerms.trim());
    start(async () => {
      const r = await saveEconomicSettings(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(t("saved"));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {!tokensReady ? (
        <p className="rounded-md border border-money/30 bg-money-wash px-3 py-2 text-xs text-money">
          {t("economicTokensMissing")}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          id="economic_enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4 accent-primary"
        />
        <Label htmlFor="economic_enabled" className="text-sm font-normal">
          {t("economicEnableLabel")}
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_journal_number">
            {t("journalNumberLabel")}
          </Label>
          <Input
            id="economic_journal_number"
            inputMode="numeric"
            value={journalNumber}
            onChange={(e) => setJournalNumber(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_revenue_account">
            {t("revenueAccountLabel")}
          </Label>
          <Input
            id="economic_revenue_account"
            inputMode="numeric"
            value={revenueAccount}
            onChange={(e) => setRevenueAccount(e.target.value)}
            placeholder="1010"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_vat_code">{t("vatCodeLabel")}</Label>
          <Input
            id="economic_vat_code"
            value={vatCode}
            onChange={(e) => setVatCode(e.target.value)}
            placeholder="U25"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_customer_group">
            {t("customerGroupLabel")}
          </Label>
          <Input
            id="economic_customer_group"
            inputMode="numeric"
            value={customerGroup}
            onChange={(e) => setCustomerGroup(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_vat_zone">{t("vatZoneLabel")}</Label>
          <Input
            id="economic_vat_zone"
            inputMode="numeric"
            value={vatZone}
            onChange={(e) => setVatZone(e.target.value)}
            placeholder={t("vatZonePlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_payment_terms">
            {t("paymentTermsLabel")}
          </Label>
          <Input
            id="economic_payment_terms"
            inputMode="numeric"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder={t("paymentTermsPlaceholder")}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tCommon("saving") : t("saveAccounting")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={probing || !tokensReady}
          onClick={() => {
            setProbe(null);
            startProbe(async () => {
              setProbe(await testEconomicConnection());
            });
          }}
        >
          <PlugZap aria-hidden />
          {probing ? t("testing") : t("testConnection")}
        </Button>
      </div>

      {probe ? (
        probe.ok ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <p>
              {t("probeConnectedPrefix")}{" "}
              <span className="font-medium">{probe.company}</span>{" "}
              {t("probeAgreement", { number: probe.agreementNumber })}
            </p>
            {probe.journals.length > 0 ? (
              <p className="text-muted-foreground mt-1">
                {t("probeJournals")}{" "}
                {probe.journals
                  .map((j) => `${j.number} · ${j.name}`)
                  .join("  |  ")}
              </p>
            ) : null}
            {probe.accountingYears.length > 0 ? (
              <p className="text-muted-foreground mt-1">
                {t("probeAccountingYears", {
                  years: probe.accountingYears.join(", "),
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-destructive text-xs">{probe.error}</p>
        )
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {success ? (
        <p
          className="text-sm text-good"
          role="status"
        >
          {success}
        </p>
      ) : null}
    </form>
  );
}
