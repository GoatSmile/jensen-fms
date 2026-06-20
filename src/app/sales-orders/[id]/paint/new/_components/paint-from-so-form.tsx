"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ColorSwatch } from "@/components/color-swatch";
import {
  BIKE_STATUS_VARIANT,
  bikeStatusLabel,
  type BikeStatus,
} from "@/lib/bikes/status";
import type {
  ColorOption,
  CurrencyOption,
  PaintPartOption,
  SupplierOption,
} from "@/app/paint-orders/_components/paint-order-form";

import { createPaintOrderFromSO } from "@/app/sales-orders/_actions/paint-from-so";

export type EligibleSOBike = {
  id: string;
  frameNumber: string;
  templateLabel: string | null;
  colorName: string | null;
  colorHex: string | null;
  status: BikeStatus;
};

type Props = {
  soId: string;
  soNumber: string;
  eligibleBikes: EligibleSOBike[];
  suppliers: SupplierOption[];
  colors: ColorOption[];
  paintParts: PaintPartOption[];
  currencies: CurrencyOption[];
  defaultSupplierId: string;
};

export function PaintFromSOForm({
  soId,
  soNumber,
  eligibleBikes,
  suppliers,
  colors,
  paintParts,
  currencies,
  defaultSupplierId,
}: Props) {
  const router = useRouter();
  // Default: every eligible frame selected.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(eligibleBikes.map((b) => b.id)),
  );
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [colorId, setColorId] = useState("");
  const [paintPartId, setPaintPartId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [currency, setCurrency] = useState("DKK");
  const [plannedSendDate, setPlannedSendDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allSelected =
    eligibleBikes.length > 0 && selected.size === eligibleBikes.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(eligibleBikes.map((b) => b.id)),
    );

  const selectedCount = useMemo(() => selected.size, [selected]);

  function clearFieldError(field: string) {
    if (errorField === field) {
      setError(null);
      setErrorField(null);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    if (selected.size === 0) {
      setError("Pick at least one frame to paint.");
      return;
    }
    startTransition(async () => {
      const result = await createPaintOrderFromSO({
        soId,
        bikeIds: [...selected],
        supplierId,
        colorId,
        paintPartId: paintPartId || null,
        unitCost: unitCost || null,
        unitCostCurrency: currency,
        plannedSendDate: plannedSendDate || null,
        notes: notes || null,
      });
      // On success the action redirects, so we only get here on failure.
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  if (eligibleBikes.length === 0) {
    return (
      <div className="bg-muted/30 flex flex-col items-center gap-2 rounded-md border p-8 text-center">
        <p className="text-sm font-medium">No frames available to paint</p>
        <p className="text-muted-foreground text-xs">
          Every bike on {soNumber} is either already in an open paint order or
          this SO has no bikes yet. Spawn an MO and add bikes first.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => router.push(`/sales-orders/${soId}`)}
        >
          Back to sales order
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="rounded-md border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">Frames to paint</h2>
            <p className="text-muted-foreground text-xs">
              {selectedCount} of {eligibleBikes.length} selected. Only frames not
              already in an open paint order are shown.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
            {allSelected ? "Clear all" : "Select all"}
          </Button>
        </header>
        <ul className="max-h-80 divide-y overflow-y-auto">
          {eligibleBikes.map((b) => {
            const checked = selected.has(b.id);
            return (
              <li key={b.id}>
                <label className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(b.id)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-mono text-sm">{b.frameNumber}</span>
                    {b.templateLabel ? (
                      <span className="text-muted-foreground text-xs">
                        {b.templateLabel}
                      </span>
                    ) : null}
                  </span>
                  {b.colorName ? (
                    <span className="hidden sm:inline">
                      <ColorSwatch hex={b.colorHex} label={b.colorName} />
                    </span>
                  ) : null}
                  <Badge variant={BIKE_STATUS_VARIANT[b.status] ?? "outline"}>
                    {bikeStatusLabel(b.status)}
                  </Badge>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-md border">
        <header className="flex flex-col gap-0.5 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Painter and colour</h2>
          <p className="text-muted-foreground text-xs">
            Pick the painter (typically Metacoat A/S) and the colour for this
            batch.
          </p>
        </header>
        <div className="flex flex-col gap-3 p-4">
          <Field
            label="Supplier"
            htmlFor="paint-supplier"
            required
            error={errorField === "supplier_id" ? error : null}
          >
            <Select
              value={supplierId}
              onValueChange={(v) => {
                setSupplierId(v);
                clearFieldError("supplier_id");
              }}
            >
              <SelectTrigger id="paint-supplier">
                <SelectValue placeholder="Pick a supplier…" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Colour"
            htmlFor="paint-color"
            required
            error={errorField === "color_id" ? error : null}
          >
            <Select
              value={colorId}
              onValueChange={(v) => {
                setColorId(v);
                clearFieldError("color_id");
              }}
            >
              <SelectTrigger id="paint-color">
                <SelectValue placeholder="Pick a colour…" />
              </SelectTrigger>
              <SelectContent>
                {colors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <ColorSwatch hex={c.hex} label={c.name_en} />
                    {c.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Paint catalog part (optional)" htmlFor="paint-part">
            <Select
              value={paintPartId}
              onValueChange={(v) => setPaintPartId(v)}
            >
              <SelectTrigger id="paint-part">
                <SelectValue placeholder="None — costed direct on this order" />
              </SelectTrigger>
              <SelectContent>
                {paintParts.length === 0 ? (
                  <div className="text-muted-foreground p-2 text-xs">
                    No Lakering parts found in the catalog.
                  </div>
                ) : (
                  paintParts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name_en}{" "}
                      <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                        ({p.internal_sku})
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className="rounded-md border">
        <header className="flex flex-col gap-0.5 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Cost and schedule</h2>
          <p className="text-muted-foreground text-xs">
            Cost is per bike charged by the painter. Sent / received timestamps
            are stamped on status transitions.
          </p>
        </header>
        <div className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label="Unit cost (per bike)"
              htmlFor="paint-cost"
              error={errorField === "unit_cost" ? error : null}
            >
              <Input
                id="paint-cost"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => {
                  setUnitCost(e.target.value);
                  clearFieldError("unit_cost");
                }}
                placeholder="0,00"
              />
            </Field>
            <Field label="Currency" htmlFor="paint-currency">
              <Select value={currency} onValueChange={(v) => setCurrency(v)}>
                <SelectTrigger id="paint-currency">
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
          </div>
          <Field label="Planned send date" htmlFor="paint-send-date">
            <Input
              id="paint-send-date"
              type="date"
              value={plannedSendDate}
              onChange={(e) => setPlannedSendDate(e.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor="paint-notes">
            <Textarea
              id="paint-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this batch."
            />
          </Field>
        </div>
      </section>

      {error && !errorField ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/sales-orders/${soId}`)}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || selectedCount === 0}>
          {isPending
            ? "Creating…"
            : `Create paint order (${selectedCount} frame${selectedCount === 1 ? "" : "s"})`}
        </Button>
      </div>
    </form>
  );
}
