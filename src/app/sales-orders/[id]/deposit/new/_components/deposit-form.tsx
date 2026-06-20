"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDkk } from "@/lib/parts/stock";
import { round2 } from "@/lib/invoicing/status";
import { createDepositInvoice } from "@/app/invoices/_actions/create-deposit";

type Props = {
  soId: string;
  soNumber: string;
  soSubtotal: number;
  currency: string;
  /** Dominant order VAT rate, for the live preview. */
  vatRate: number;
  /** Ex-VAT subtotal of deposits already taken on this order. */
  priorDepositSubtotal: number;
};

export function DepositForm({
  soId,
  soNumber,
  soSubtotal,
  currency,
  vatRate,
  priorDepositSubtotal,
}: Props) {
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const num = Number(value.replace(",", "."));
  const hasValue = value.trim() !== "" && Number.isFinite(num) && num > 0;
  const pctTooBig = mode === "percent" && num > 100;
  const depositSubtotal = !hasValue
    ? 0
    : mode === "percent"
      ? round2(soSubtotal * (num / 100))
      : round2(num);
  const depositVat = round2(depositSubtotal * (vatRate / 100));
  const depositTotal = round2(depositSubtotal + depositVat);
  const remaining = round2(soSubtotal - priorDepositSubtotal);
  const over = depositSubtotal > remaining + 0.001;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createDepositInvoice(soId, { mode, value: num });
      // Success redirects server-side; only an error returns here.
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Deposit basis</span>
        <div className="flex w-fit rounded-md border p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("percent")}
            className={`rounded px-3 py-1 ${mode === "percent" ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            Percentage
          </button>
          <button
            type="button"
            onClick={() => setMode("amount")}
            className={`rounded px-3 py-1 ${mode === "amount" ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            Amount (ex-VAT)
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deposit-value" className="text-sm font-medium">
          {mode === "percent" ? "Percentage of order" : "Amount (ex-VAT)"}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="deposit-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder={mode === "percent" ? "e.g. 50" : "e.g. 5000"}
            autoFocus
            className="max-w-[180px]"
          />
          <span className="text-muted-foreground text-sm">
            {mode === "percent" ? "%" : currency}
          </span>
        </div>
        {pctTooBig ? (
          <p className="text-destructive text-xs">Percentage can&rsquo;t exceed 100.</p>
        ) : over ? (
          <p className="text-destructive text-xs">
            Exceeds the {formatDkk(remaining)} still un-deposited on this order.
          </p>
        ) : null}
      </div>

      <div className="bg-muted/30 flex flex-col gap-1 rounded-md border p-3 text-sm">
        <Row label="Order subtotal" value={formatDkk(soSubtotal)} />
        {priorDepositSubtotal > 0 ? (
          <Row
            label="Deposits already taken"
            value={`− ${formatDkk(priorDepositSubtotal)}`}
          />
        ) : null}
        <div className="my-1 border-t" />
        <Row label="This deposit (ex-VAT)" value={formatDkk(depositSubtotal)} strong />
        <Row label={`VAT (${vatRate} %)`} value={formatDkk(depositVat)} />
        <Row label="Deposit total" value={formatDkk(depositTotal)} strong />
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="outline" type="button" disabled={pending}>
          <Link href={`/sales-orders/${soId}`}>Cancel</Link>
        </Button>
        <Button
          type="submit"
          disabled={pending || !hasValue || pctTooBig || over}
        >
          {pending ? "Creating…" : `Create deposit invoice for ${soNumber}`}
        </Button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
