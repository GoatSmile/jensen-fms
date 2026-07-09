"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
      setSuccess("Saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {!tokensReady ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
          API tokens are not set. Add ECONOMIC_APP_SECRET_TOKEN and
          ECONOMIC_AGREEMENT_GRANT_TOKEN to .env.local (and Vercel), then
          restart — tokens are secrets and never live in this form.
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
          Enable the e-conomic integration (shows the push button on issued
          invoices)
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_journal_number">Journal number</Label>
          <Input
            id="economic_journal_number"
            inputMode="numeric"
            value={journalNumber}
            onChange={(e) => setJournalNumber(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_revenue_account">Revenue account</Label>
          <Input
            id="economic_revenue_account"
            inputMode="numeric"
            value={revenueAccount}
            onChange={(e) => setRevenueAccount(e.target.value)}
            placeholder="1010"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_vat_code">Outgoing VAT code</Label>
          <Input
            id="economic_vat_code"
            value={vatCode}
            onChange={(e) => setVatCode(e.target.value)}
            placeholder="U25"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_customer_group">Customer group</Label>
          <Input
            id="economic_customer_group"
            inputMode="numeric"
            value={customerGroup}
            onChange={(e) => setCustomerGroup(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_vat_zone">VAT zone</Label>
          <Input
            id="economic_vat_zone"
            inputMode="numeric"
            value={vatZone}
            onChange={(e) => setVatZone(e.target.value)}
            placeholder="1 (domestic)"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="economic_payment_terms">Payment terms</Label>
          <Input
            id="economic_payment_terms"
            inputMode="numeric"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="e.g. 1"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save accounting settings"}
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
          {probing ? "Testing…" : "Test connection"}
        </Button>
      </div>

      {probe ? (
        probe.ok ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <p>
              Connected to <span className="font-medium">{probe.company}</span>{" "}
              (agreement {probe.agreementNumber}).
            </p>
            {probe.journals.length > 0 ? (
              <p className="text-muted-foreground mt-1">
                Journals:{" "}
                {probe.journals
                  .map((j) => `${j.number} · ${j.name}`)
                  .join("  |  ")}
              </p>
            ) : null}
            {probe.accountingYears.length > 0 ? (
              <p className="text-muted-foreground mt-1">
                Open accounting years: {probe.accountingYears.join(", ")}
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
          className="text-sm text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          {success}
        </p>
      ) : null}
    </form>
  );
}
