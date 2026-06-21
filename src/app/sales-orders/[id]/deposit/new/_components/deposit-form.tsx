"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDkk } from "@/lib/parts/stock";
import { round2 } from "@/lib/invoicing/status";
import {
  createDepositInvoice,
  type DepositInput,
} from "@/app/invoices/_actions/create-deposit";

export type DepositPartChoice = {
  id: string;
  internal_sku: string;
  name_en: string;
  retail: number | null;
};

type Mode = "percent" | "amount" | "parts";

type PartRow = {
  partId: string;
  sku: string;
  name: string;
  quantity: string;
  unitPrice: string;
};

type Props = {
  soId: string;
  soNumber: string;
  soSubtotal: number;
  currency: string;
  vatRate: number;
  priorDepositSubtotal: number;
  parts: DepositPartChoice[];
};

export function DepositForm({
  soId,
  soNumber,
  soSubtotal,
  currency,
  vatRate,
  priorDepositSubtotal,
  parts,
}: Props) {
  const [mode, setMode] = useState<Mode>("percent");
  const [value, setValue] = useState("");
  const [partRows, setPartRows] = useState<PartRow[]>([]);
  const [pickPartId, setPickPartId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const partsById = useMemo(
    () => new Map(parts.map((p) => [p.id, p])),
    [parts],
  );
  const addablePartIds = useMemo(
    () => new Set(partRows.map((r) => r.partId)),
    [partRows],
  );

  const num = Number(value.replace(",", "."));
  const hasValue = value.trim() !== "" && Number.isFinite(num) && num > 0;
  const pctTooBig = mode === "percent" && num > 100;

  const partsSubtotal = round2(
    partRows.reduce((s, r) => {
      const q = Number(r.quantity.replace(",", "."));
      const p = Number(r.unitPrice.replace(",", "."));
      return s + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0);
    }, 0),
  );

  const depositSubtotal =
    mode === "parts"
      ? partsSubtotal
      : !hasValue
        ? 0
        : mode === "percent"
          ? round2(soSubtotal * (num / 100))
          : round2(num);
  const depositVat = round2(depositSubtotal * (vatRate / 100));
  const depositTotal = round2(depositSubtotal + depositVat);
  const remaining = round2(soSubtotal - priorDepositSubtotal);
  const over = depositSubtotal > remaining + 0.001;

  const canSubmit =
    !pending &&
    !over &&
    depositSubtotal > 0 &&
    (mode === "parts" ? partRows.length > 0 : hasValue && !pctTooBig);

  function addPart(partId: string) {
    const p = partsById.get(partId);
    if (!p || addablePartIds.has(partId)) return;
    setPartRows((prev) => [
      ...prev,
      {
        partId: p.id,
        sku: p.internal_sku,
        name: p.name_en,
        quantity: "1",
        unitPrice: p.retail != null ? String(p.retail) : "",
      },
    ]);
    setPickPartId("");
  }

  function updateRow(partId: string, patch: Partial<PartRow>) {
    setPartRows((prev) =>
      prev.map((r) => (r.partId === partId ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(partId: string) {
    setPartRows((prev) => prev.filter((r) => r.partId !== partId));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const payload: DepositInput =
      mode === "parts"
        ? {
            mode: "parts",
            parts: partRows.map((r) => ({
              partId: r.partId,
              quantity: Number(r.quantity.replace(",", ".")),
              unitPrice: Number(r.unitPrice.replace(",", ".")),
            })),
          }
        : { mode, value: num };
    start(async () => {
      const r = await createDepositInvoice(soId, payload);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Deposit basis</span>
        <div className="flex w-fit flex-wrap rounded-md border p-0.5 text-sm">
          {(
            [
              ["percent", "Percentage"],
              ["amount", "Amount (ex-VAT)"],
              ["parts", "Specific parts"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 ${mode === m ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "parts" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Parts the customer prepays</span>
            <div className="flex items-center gap-2">
              <Select value={pickPartId} onValueChange={addPart}>
                <SelectTrigger className="max-w-sm text-sm">
                  <SelectValue placeholder="Add a part…" />
                </SelectTrigger>
                <SelectContent>
                  {parts
                    .filter((p) => !addablePartIds.has(p.id))
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-mono text-xs">{p.internal_sku}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {p.name_en}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {partRows.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm italic">
              Pick the parts the customer is paying for up front (e.g. the frames).
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {partRows.map((r) => {
                const q = Number(r.quantity.replace(",", "."));
                const p = Number(r.unitPrice.replace(",", "."));
                const ls =
                  Number.isFinite(q) && Number.isFinite(p) ? round2(q * p) : 0;
                return (
                  <li
                    key={r.partId}
                    className="flex flex-wrap items-center gap-3 p-2.5 text-sm"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{r.name}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {r.sku}
                      </span>
                    </div>
                    <label className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground">Qty</span>
                      <Input
                        value={r.quantity}
                        onChange={(e) =>
                          updateRow(r.partId, { quantity: e.target.value })
                        }
                        inputMode="decimal"
                        className="h-8 w-16 text-right text-xs"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground">{currency}</span>
                      <Input
                        value={r.unitPrice}
                        onChange={(e) =>
                          updateRow(r.partId, { unitPrice: e.target.value })
                        }
                        inputMode="decimal"
                        placeholder="unit price"
                        className="h-8 w-24 text-right text-xs"
                      />
                    </label>
                    <span className="w-24 text-right tabular-nums">
                      {formatDkk(ls)}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeRow(r.partId)}
                      aria-label={`Remove ${r.sku}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
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
            <p className="text-destructive text-xs">
              Percentage can&rsquo;t exceed 100.
            </p>
          ) : null}
        </div>
      )}

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
        {over ? (
          <p className="text-destructive mt-1 text-xs">
            Exceeds the {formatDkk(remaining)} still un-deposited on this order.
          </p>
        ) : null}
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
        <Button type="submit" disabled={!canSubmit}>
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
