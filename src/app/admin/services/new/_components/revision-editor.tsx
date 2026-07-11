"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/format";

import {
  saveServicePriceRevision,
  type RevisionItemInput,
} from "../../_actions/save-revision";

export type TierCol = { min: number; max: number | null };

export type EditorSourceList = {
  id: string;
  name: string;
  currency: string;
  effectiveFrom: string | null;
  version: number;
  supplierId: string;
  serviceTypeId: string;
  supplierName: string;
  serviceTypeName: string;
  items: {
    servicePartTypeId: string;
    supplierItemNo: string | null;
    tierMin: number;
    tierMax: number | null;
    unitPrice: number;
  }[];
};

type PartTypeOption = { id: string; name_en: string; sort_order: number };

type Cell = { price: string; itemNo: string };
type Row = { partTypeId: string; cells: Cell[] };

type Props = {
  source: EditorSourceList | null;
  tiers: TierCol[];
  partTypes: PartTypeOption[];
  currencies: string[];
  suppliers: { id: string; name: string }[];
  serviceTypes: { id: string; name_en: string }[];
};

function tierHeading(t: TierCol): string {
  return t.max == null ? `${t.min}+` : `${t.min}–${t.max}`;
}

function emptyCells(tiers: TierCol[]): Cell[] {
  return tiers.map(() => ({ price: "", itemNo: "" }));
}

/** Cell grid keyed [row][tierIdx]; blank price = no item at that tier. */
function rowsFromSource(
  source: EditorSourceList,
  tiers: TierCol[],
  partTypes: PartTypeOption[],
): Row[] {
  const byPartType = new Map<string, Cell[]>();
  for (const item of source.items) {
    const tierIdx = tiers.findIndex(
      (t) => t.min === item.tierMin && (t.max ?? null) === (item.tierMax ?? null),
    );
    if (tierIdx < 0) continue;
    const cells = byPartType.get(item.servicePartTypeId) ?? emptyCells(tiers);
    cells[tierIdx] = {
      price: String(item.unitPrice),
      itemNo: item.supplierItemNo ?? "",
    };
    byPartType.set(item.servicePartTypeId, cells);
  }
  const sortOf = new Map(partTypes.map((pt) => [pt.id, pt.sort_order]));
  return [...byPartType.entries()]
    .sort(([a], [b]) => (sortOf.get(a) ?? 0) - (sortOf.get(b) ?? 0))
    .map(([partTypeId, cells]) => ({ partTypeId, cells }));
}

export function RevisionEditor({
  source,
  tiers,
  partTypes,
  currencies,
  suppliers,
  serviceTypes,
}: Props) {
  const [supplierId, setSupplierId] = useState(source?.supplierId ?? "");
  const [serviceTypeId, setServiceTypeId] = useState(
    source?.serviceTypeId ?? "",
  );
  const [name, setName] = useState(source?.name ?? "");
  const [currency, setCurrency] = useState(source?.currency ?? "DKK");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    source
      ? rowsFromSource(source, tiers, partTypes)
      : partTypes.map((pt) => ({ partTypeId: pt.id, cells: emptyCells(tiers) })),
  );
  const [addPartTypeId, setAddPartTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const partTypeName = useMemo(
    () => new Map(partTypes.map((pt) => [pt.id, pt.name_en])),
    [partTypes],
  );
  const presentIds = new Set(rows.map((r) => r.partTypeId));
  const addable = partTypes.filter((pt) => !presentIds.has(pt.id));

  function updateCell(
    rowIdx: number,
    tierIdx: number,
    patch: Partial<Cell>,
  ): void {
    setRows((prev) =>
      prev.map((row, i) =>
        i === rowIdx
          ? {
              ...row,
              cells: row.cells.map((c, j) =>
                j === tierIdx ? { ...c, ...patch } : c,
              ),
            }
          : row,
      ),
    );
  }

  function addRow(): void {
    if (!addPartTypeId) return;
    setRows((prev) => [
      ...prev,
      { partTypeId: addPartTypeId, cells: emptyCells(tiers) },
    ]);
    setAddPartTypeId("");
  }

  function removeRow(rowIdx: number): void {
    setRows((prev) => prev.filter((_, i) => i !== rowIdx));
  }

  // Diff vs the source revision — the review step of the yearly bump.
  const diff = useMemo(() => {
    if (!source) return [];
    const lines: string[] = [];
    const sourceCell = new Map<string, { price: number; itemNo: string }>();
    for (const item of source.items) {
      sourceCell.set(
        `${item.servicePartTypeId}|${item.tierMin}:${item.tierMax ?? "open"}`,
        { price: item.unitPrice, itemNo: item.supplierItemNo ?? "" },
      );
    }
    const seenKeys = new Set<string>();
    for (const row of rows) {
      const rowName = partTypeName.get(row.partTypeId) ?? "—";
      row.cells.forEach((cell, tierIdx) => {
        const t = tiers[tierIdx];
        const key = `${row.partTypeId}|${t.min}:${t.max ?? "open"}`;
        seenKeys.add(key);
        const old = sourceCell.get(key);
        const newPrice = cell.price.trim() === "" ? null : Number(cell.price);
        if (old == null && newPrice != null) {
          lines.push(
            `${rowName} ${tierHeading(t)}: new — ${formatPrice(newPrice, currency)}`,
          );
        } else if (old != null && newPrice == null) {
          lines.push(
            `${rowName} ${tierHeading(t)}: removed (was ${formatPrice(old.price, currency)})`,
          );
        } else if (old != null && newPrice != null) {
          if (newPrice !== old.price) {
            lines.push(
              `${rowName} ${tierHeading(t)}: ${formatPrice(old.price, currency)} → ${formatPrice(newPrice, currency)}`,
            );
          } else if (cell.itemNo.trim() !== old.itemNo) {
            lines.push(`${rowName} ${tierHeading(t)}: item no. changed`);
          }
        }
      });
    }
    for (const [key] of sourceCell) {
      if (seenKeys.has(key)) continue;
      const [ptId] = key.split("|");
      lines.push(`${partTypeName.get(ptId) ?? "—"}: row removed`);
    }
    return lines;
  }, [source, rows, tiers, currency, partTypeName]);

  function onPublish(): void {
    setError(null);
    const items: RevisionItemInput[] = [];
    for (const row of rows) {
      row.cells.forEach((cell, tierIdx) => {
        const raw = cell.price.trim();
        if (raw === "") return;
        const t = tiers[tierIdx];
        items.push({
          servicePartTypeId: row.partTypeId,
          tierMin: t.min,
          tierMax: t.max,
          unitPrice: Number(raw.replace(",", ".")),
          supplierItemNo: cell.itemNo.trim() || null,
        });
      });
    }
    const bad = items.find(
      (i) => !Number.isFinite(i.unitPrice) || i.unitPrice < 0,
    );
    if (bad) {
      setError("Prices must be numbers of zero or above.");
      return;
    }
    start(async () => {
      const r = await saveServicePriceRevision({
        supplierId,
        serviceTypeId,
        name,
        currency,
        effectiveFrom: effectiveFrom || null,
        items,
      });
      // On success the action redirects; reaching here means failure.
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-md border p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {source ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Supplier</Label>
                <p className="text-sm">{source.supplierName}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Service</Label>
                <p className="text-sm">{source.serviceTypeName}</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rev-supplier">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="rev-supplier">
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rev-type">Service</Label>
                <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                  <SelectTrigger id="rev-type">
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rev-name">Revision name</Label>
            <Input
              id="rev-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SIK priser 2027"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rev-effective">Effective from</Label>
            <Input
              id="rev-effective"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rev-currency">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="rev-currency" className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="rounded-md border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">Prices per piece</h2>
            <p className="text-muted-foreground text-xs">
              One row per part type, one column per quantity tier. Blank
              cells stay unpriced; the supplier&apos;s own item number sits
              under each price.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={addPartTypeId} onValueChange={setAddPartTypeId}>
              <SelectTrigger size="sm" className="w-[160px]" aria-label="Part type">
                <SelectValue placeholder="Part type…" />
              </SelectTrigger>
              <SelectContent>
                {addable.length === 0 ? (
                  <div className="text-muted-foreground p-2 text-xs">
                    Every part type has a row.
                  </div>
                ) : (
                  addable.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>
                      {pt.name_en}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addRow}
              disabled={addPartTypeId === ""}
            >
              <Plus aria-hidden /> Add row
            </Button>
          </div>
        </header>

        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-2 py-2 font-medium">Part</th>
                {tiers.map((t) => (
                  <th key={tierHeading(t)} className="px-2 py-2 font-medium">
                    {tierHeading(t)} pcs · {currency}
                  </th>
                ))}
                <th className="w-[50px] px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, rowIdx) => (
                <tr key={row.partTypeId}>
                  <td className="px-2 py-2 align-top font-medium">
                    {partTypeName.get(row.partTypeId) ?? "—"}
                  </td>
                  {row.cells.map((cell, tierIdx) => (
                    <td key={tierIdx} className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={cell.price}
                          onChange={(e) =>
                            updateCell(rowIdx, tierIdx, {
                              price: e.target.value,
                            })
                          }
                          placeholder="—"
                          className="h-8 w-28 tabular-nums"
                          aria-label={`${partTypeName.get(row.partTypeId) ?? ""} ${tierHeading(tiers[tierIdx])} price`}
                        />
                        <Input
                          value={cell.itemNo}
                          onChange={(e) =>
                            updateCell(rowIdx, tierIdx, {
                              itemNo: e.target.value,
                            })
                          }
                          placeholder="item no."
                          className="h-7 w-28 font-mono text-xs"
                          aria-label={`${partTypeName.get(row.partTypeId) ?? ""} ${tierHeading(tiers[tierIdx])} item number`}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2 align-top">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => removeRow(rowIdx)}
                      aria-label={`Remove ${partTypeName.get(row.partTypeId) ?? ""} row`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {source ? (
        <section className="rounded-md border p-4">
          <h2 className="text-sm font-semibold">
            Changes vs {source.name} (v{source.version})
          </h2>
          {diff.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              No changes yet — identical to the current revision.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {diff.map((line, i) => (
                <li key={`${i}-${line}`} className="tabular-nums">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/admin/services">Cancel</Link>
        </Button>
        <Button
          type="button"
          onClick={onPublish}
          disabled={isPending || (source != null && diff.length === 0)}
        >
          {isPending ? "Publishing…" : "Publish revision"}
        </Button>
      </div>
    </div>
  );
}
