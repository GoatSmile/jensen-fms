"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatPrice } from "@/lib/format";
import { formatPct } from "@/lib/parts/format";

import { addLine, updateLine } from "../_actions/manage-lines";

export type PartChoice = {
  id: string;
  internal_sku: string;
  name_en: string;
  /** Snapshotted onto the PO line at insert; preview here for transparency. */
  hsCode: string | null;
  tariffPct: number;
};

export type CurrencyChoice = {
  code: string;
  name_en: string;
};

export type LineDialogInitial = {
  lineId: string;
  partId: string;
  partLabel: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  fxRateToDkk: number;
  /** Decimal 0.10 = 10 %. */
  transportPct: number;
  /** Decimal — snapshotted from the part's HS code at the time the line was added. */
  tariffPct: number;
  notes: string | null;
};

type Mode =
  | { kind: "add"; poId: string }
  | { kind: "edit"; initial: LineDialogInitial };

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
  parts: PartChoice[];
  currencies: CurrencyChoice[];
  /** Latest from_currency → DKK rate, used to pre-fill fx_rate_to_dkk. */
  fxRatesByCurrency: Record<string, number>;
  /** Part ids already on the PO (other rows), disabled in the picker. */
  excludePartIds: Set<string>;
  /** Default transport % for new lines, sourced from app_settings (0.10 = 10 %). */
  defaultTransportPct: number;
};

/**
 * Add / edit a PO line. The DB owns `landed_cost_dkk_per_unit` (it's a
 * GENERATED column) so we never write it — we only preview the same
 * arithmetic in the footer so the user sees the landed cost as they type.
 *
 * FX rate behaviour:
 *   - DKK → forced to 1.0, input disabled.
 *   - Anything else → auto-filled from the latest fx_rates row when known,
 *     otherwise we show a hint and leave the input editable.
 */
export function LineDialog({
  open,
  onOpenChange,
  mode,
  parts,
  currencies,
  fxRatesByCurrency,
  excludePartIds,
  defaultTransportPct,
}: Props) {
  const router = useRouter();
  const initialPartId = mode.kind === "edit" ? mode.initial.partId : "";
  const initialQty =
    mode.kind === "edit" ? String(mode.initial.quantity) : "1";
  const initialPrice =
    mode.kind === "edit" ? String(mode.initial.unitPrice) : "";
  const initialCurrency =
    mode.kind === "edit" ? mode.initial.currency : "DKK";
  const initialFx =
    mode.kind === "edit"
      ? String(mode.initial.fxRateToDkk)
      : initialCurrency === "DKK"
        ? "1"
        : String(fxRatesByCurrency[initialCurrency] ?? "");
  // Form holds the percent (e.g. "10.2") but the action expects the DB-side
  // decimal (0.102). Conversion happens in buildFormData() below.
  const initialTransport =
    mode.kind === "edit"
      ? String(Math.round(mode.initial.transportPct * 10000) / 100)
      : String(Math.round(defaultTransportPct * 10000) / 100);
  const initialNotes =
    mode.kind === "edit" ? mode.initial.notes ?? "" : "";

  const [partId, setPartId] = useState(initialPartId);
  const [filter, setFilter] = useState("");
  const [quantity, setQuantity] = useState(initialQty);
  const [unitPrice, setUnitPrice] = useState(initialPrice);
  const [currency, setCurrency] = useState(initialCurrency);
  const [fxRate, setFxRate] = useState(initialFx);
  const [transport, setTransport] = useState(initialTransport);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  // Look up the selected part's tariff snapshot for the preview. Edit mode
  // shows the snapshotted value from when the line was first added; add mode
  // shows the live value from the part's current HS code.
  const selectedPart = useMemo(
    () => parts.find((p) => p.id === partId) ?? null,
    [parts, partId],
  );
  const previewTariffPct =
    mode.kind === "edit"
      ? mode.initial.tariffPct
      : (selectedPart?.tariffPct ?? 0);
  const previewHsCode =
    mode.kind === "edit"
      ? null
      : (selectedPart?.hsCode ?? null);

  // Edit mode locks the part to keep the row identity stable in the UI.
  const partLocked = mode.kind === "edit";

  // Keep FX rate in lock-step with the currency choice. Handled inline on
  // currency change rather than via an effect to avoid a cascading render
  // (and to satisfy react-hooks/set-state-in-effect). DKK is always 1; for
  // foreign currencies we prefer the seeded fx_rates row but let the user
  // override after.
  function onCurrencyChange(next: string) {
    setCurrency(next);
    if (next === "DKK") {
      setFxRate("1");
    } else {
      const known = fxRatesByCurrency[next];
      setFxRate(known != null ? String(known) : "");
    }
  }

  const filteredParts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) =>
      `${p.internal_sku} ${p.name_en}`.toLowerCase().includes(q),
    );
  }, [parts, filter]);

  // Live preview of the additive landed-cost breakdown. Keeping each piece
  // separate so the dialog can show the user "base + transport + import tax".
  // The transport input holds the percent (e.g. "10.2"); divide by 100 for
  // arithmetic. The tariff snapshot is already a decimal.
  const breakdown = useMemo(() => {
    const u = Number(String(unitPrice).replace(",", "."));
    const fx = Number(String(fxRate).replace(",", "."));
    const tpPercent = Number(String(transport).replace(",", "."));
    const tt = previewTariffPct;
    if (
      !Number.isFinite(u) ||
      !Number.isFinite(fx) ||
      !Number.isFinite(tpPercent) ||
      !Number.isFinite(tt)
    ) {
      return null;
    }
    if (u < 0 || fx <= 0 || tpPercent < 0 || tt < 0) return null;
    const tp = tpPercent / 100;
    const base = u * fx;
    const transportDkk = base * tp;
    const importTaxDkk = base * tt;
    const landed = base + transportDkk + importTaxDkk;
    return {
      base: Math.round(base * 10000) / 10000,
      transportDkk: Math.round(transportDkk * 10000) / 10000,
      importTaxDkk: Math.round(importTaxDkk * 10000) / 10000,
      landed: Math.round(landed * 10000) / 10000,
    };
  }, [unitPrice, fxRate, transport, previewTariffPct]);

  const lineTotalNative = useMemo(() => {
    const u = Number(String(unitPrice).replace(",", "."));
    const q = Number(String(quantity).replace(",", "."));
    if (!Number.isFinite(u) || !Number.isFinite(q)) return null;
    if (u < 0 || q <= 0) return null;
    return u * q;
  }, [unitPrice, quantity]);

  const fxKnown =
    currency === "DKK" || fxRatesByCurrency[currency] != null;

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "part_id", partId);
    appendField(fd, "quantity", quantity.trim().replace(",", "."));
    appendField(fd, "unit_price", unitPrice.trim().replace(",", "."));
    appendField(fd, "currency", currency);
    appendField(fd, "fx_rate_to_dkk", fxRate.trim().replace(",", "."));
    // UI holds a percent ("10.2"); action expects the DB-side decimal.
    const transportPercent =
      transport.trim() === ""
        ? defaultTransportPct * 100
        : Number(transport.trim().replace(",", "."));
    const transportDecimal = Number.isFinite(transportPercent)
      ? transportPercent / 100
      : defaultTransportPct;
    appendField(fd, "transport_pct", String(transportDecimal));
    appendField(fd, "notes", notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!partId) {
      setError("Pick a part.");
      return;
    }

    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "add"
          ? await addLine(mode.poId, fd)
          : await updateLine(mode.initial.lineId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const title = mode.kind === "add" ? "Add line" : "Edit line";
  const submitLabel = mode.kind === "add" ? "Add line" : "Save changes";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Landed DKK/unit = unit price × FX rate × (1 + transport % +
              import duty %). Both percentages are frozen onto this line at
              insert; later admin edits don&apos;t retroactively change cost
              basis.
            </DialogDescription>
          </DialogHeader>

          {/* Part picker */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-part-filter">Part</Label>
            {partLocked ? (
              <div className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">
                  {mode.kind === "edit" ? mode.initial.partLabel : ""}
                </span>
              </div>
            ) : (
              <>
                <Input
                  id="line-part-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter parts by SKU or name…"
                />
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  {filteredParts.length === 0 ? (
                    <p className="text-muted-foreground p-3 text-center text-sm">
                      No parts match.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {filteredParts.map((p) => {
                        const disabled = excludePartIds.has(p.id);
                        const isPicked = partId === p.id;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setPartId(p.id)}
                              disabled={disabled}
                              className={`hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                                isPicked ? "bg-muted" : ""
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{p.name_en}</span>
                                <span className="text-muted-foreground font-mono text-xs">
                                  {p.internal_sku}
                                </span>
                              </div>
                              {disabled ? (
                                <span className="text-muted-foreground text-xs">
                                  already on PO
                                </span>
                              ) : isPicked ? (
                                <span className="text-xs text-emerald-700 dark:text-emerald-400">
                                  selected
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-qty">Quantity</Label>
              <Input
                id="line-qty"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-price">Unit price</Label>
              <Input
                id="line-price"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-currency">Currency</Label>
              <Select value={currency} onValueChange={onCurrencyChange}>
                <SelectTrigger id="line-currency">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-fx">FX rate to DKK</Label>
              <Input
                id="line-fx"
                inputMode="decimal"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                disabled={currency === "DKK"}
                required
              />
              {currency !== "DKK" && !fxKnown ? (
                <p className="text-muted-foreground text-xs">
                  No FX rate on file for {currency} — enter manually.
                </p>
              ) : currency !== "DKK" ? (
                <p className="text-muted-foreground text-xs">
                  Pre-filled from the latest fx_rates row. Override if you have
                  a fresher number on the invoice.
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-transport">Transport %</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="line-transport"
                  inputMode="decimal"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  placeholder={String(
                    Math.round(defaultTransportPct * 10000) / 100,
                  )}
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Freight markup as a percent — e.g.{" "}
                <span className="font-mono">10</span> for 10 %. Default from{" "}
                <code>/admin/settings</code>.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-notes">Notes</Label>
            <Textarea
              id="line-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — e.g. supplier SKU on this PO, packing details."
            />
          </div>

          {/* Live preview of the additive landed-cost breakdown. */}
          <div className="bg-muted/30 flex flex-col gap-1.5 rounded-md border px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Line total ({currency})</span>
              <span className="font-medium tabular-nums">
                {formatPrice(lineTotalNative, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base DKK/unit</span>
              <span className="tabular-nums">
                {formatPrice(breakdown?.base ?? null, "DKK")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ Transport</span>
              <span className="tabular-nums">
                {formatPrice(breakdown?.transportDkk ?? null, "DKK")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                + Import tax{" "}
                {previewHsCode ? (
                  <span className="font-mono">({previewHsCode}, {formatPct(previewTariffPct)})</span>
                ) : previewTariffPct > 0 ? (
                  <span>({formatPct(previewTariffPct)})</span>
                ) : (
                  <span className="italic">no HS code</span>
                )}
              </span>
              <span className="tabular-nums">
                {formatPrice(breakdown?.importTaxDkk ?? null, "DKK")}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">Landed DKK/unit</span>
              <span className="font-semibold tabular-nums">
                {formatPrice(breakdown?.landed ?? null, "DKK")}
              </span>
            </div>
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !partId}>
              {isPending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
