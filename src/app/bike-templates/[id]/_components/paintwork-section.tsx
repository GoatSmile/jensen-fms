"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemplatePaintworkRow } from "@/lib/services/template-paint";

import {
  addTemplatePaintPart,
  removeTemplatePaintPart,
  updateTemplatePaintPart,
} from "../_actions/manage-service-parts";

export type PaintPartTypeOption = { id: string; name_en: string };

type Props = {
  templateId: string;
  isCurrent: boolean;
  rows: TemplatePaintworkRow[];
  partTypes: PaintPartTypeOption[];
  /** Footer summary, computed server-side. */
  totalLabel: string | null;
  listLabel: string | null;
  unpricedCount: number;
};

/**
 * The template's paintwork declaration: which part-units one bike of this
 * template sends to the painter, priced live against the default painter's
 * current list at per-bike quantities (the 1–9 tier for singles). The DKK
 * total joins the parts cost in the recipe section's cost-to-produce box.
 */
export function PaintworkSection({
  templateId,
  isCurrent,
  rows,
  partTypes,
  totalLabel,
  listLabel,
  unpricedCount,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const canEdit = isCurrent;

  const declaredIds = new Set(rows.map((r) => r.partTypeId));
  const addablePartTypes = partTypes.filter((pt) => !declaredIds.has(pt.id));

  return (
    <section className="rounded-md border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Paintwork</h2>
          <p className="text-muted-foreground text-xs">
            What one bike of this template sends to the painter. Estimated at
            per-bike quantities (singles tier) from the painter&apos;s current
            list — batch tiers apply on the paint order itself.
          </p>
        </div>
        {canEdit ? (
          <AddPaintworkRow
            templateId={templateId}
            partTypes={addablePartTypes}
            onError={setError}
            onChange={() => router.refresh()}
          />
        ) : null}
      </header>

      <div className="p-4">
        {error ? (
          <p className="text-destructive mb-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <div className="text-muted-foreground flex h-16 items-center justify-center rounded-md border border-dashed text-sm">
            {canEdit
              ? "No paintwork declared — add the part types the painter handles for this bike."
              : "No paintwork declared on this version."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border md:overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">Part</th>
                  <th className="px-4 py-2 font-medium">Qty / bike</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                    Per piece
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Line</th>
                  {canEdit ? <th className="w-[60px] px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <PaintworkRow
                    key={r.id}
                    templateId={templateId}
                    row={r}
                    canEdit={canEdit}
                    onError={setError}
                    onChange={() => router.refresh()}
                  />
                ))}
              </tbody>
            </table>
            <div className="flex flex-col gap-1 border-t px-4 py-2">
              {totalLabel ? (
                <div className="text-muted-foreground flex justify-end gap-2 text-sm">
                  <span>
                    Paint per bike (estimated
                    {listLabel ? `, ${listLabel}` : ""}):
                  </span>
                  <span className="text-foreground font-medium tabular-nums">
                    {totalLabel}
                  </span>
                </div>
              ) : null}
              {unpricedCount > 0 ? (
                <p className="text-right text-xs text-amber-600 dark:text-amber-500">
                  {unpricedCount}{" "}
                  {unpricedCount === 1 ? "line has" : "lines have"} no price on
                  the current list.
                </p>
              ) : null}
            </div>
          </div>
        )}

        {rows.length > 0 && listLabel == null ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
            No current painting price list found — the paintwork can&apos;t be
            priced, so the cost-to-produce box shows parts only.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function PaintworkRow({
  templateId,
  row,
  canEdit,
  onError,
  onChange,
}: {
  templateId: string;
  row: TemplatePaintworkRow;
  canEdit: boolean;
  onError: (msg: string | null) => void;
  onChange: () => void;
}) {
  const [pending, start] = useTransition();
  const [qty, setQty] = useState(String(row.quantity));

  function commitQty() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      setQty(String(row.quantity));
      return;
    }
    if (n === row.quantity) return;
    onError(null);
    start(async () => {
      const r = await updateTemplatePaintPart(templateId, row.id, {
        quantity: n,
      });
      if (!r.ok) {
        onError(r.error);
        setQty(String(row.quantity));
      } else onChange();
    });
  }

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removeTemplatePaintPart(templateId, row.id);
      if (!r.ok) onError(r.error);
      else onChange();
    });
  }

  return (
    <tr>
      <td className="px-4 py-2.5">{row.partTypeName}</td>
      <td className="px-4 py-2.5">
        {canEdit ? (
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={pending}
            className="h-8 w-20 tabular-nums"
            aria-label={`Quantity of ${row.partTypeName}`}
          />
        ) : (
          <span className="tabular-nums">{row.quantity}</span>
        )}
      </td>
      <td className="hidden px-4 py-2.5 text-right sm:table-cell">
        {row.unitPriceLabel ? (
          <span className="inline-flex items-center gap-1.5">
            {row.tierBadge ? (
              <Badge variant="outline" className="font-normal">
                {row.tierBadge}
              </Badge>
            ) : null}
            <span className="tabular-nums">{row.unitPriceLabel}</span>
          </span>
        ) : (
          <span className="text-amber-600 dark:text-amber-500">no price</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {row.lineTotalLabel ?? <span className="text-muted-foreground">—</span>}
      </td>
      {canEdit ? (
        <td className="px-4 py-2.5 text-right">
          <Button
            size="xs"
            variant="outline"
            onClick={runRemove}
            disabled={pending}
            aria-label={`Remove ${row.partTypeName} paintwork line`}
          >
            <Trash2 aria-hidden />
          </Button>
        </td>
      ) : null}
    </tr>
  );
}

function AddPaintworkRow({
  templateId,
  partTypes,
  onError,
  onChange,
}: {
  templateId: string;
  partTypes: PaintPartTypeOption[];
  onError: (msg: string | null) => void;
  onChange: () => void;
}) {
  const [partTypeId, setPartTypeId] = useState("");
  const [qty, setQty] = useState("1");
  const [isPending, start] = useTransition();

  function onAdd() {
    onError(null);
    if (!partTypeId) {
      onError("Pick a part type to add.");
      return;
    }
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      onError("Quantity must be a whole number above zero.");
      return;
    }
    start(async () => {
      const r = await addTemplatePaintPart(templateId, {
        servicePartTypeId: partTypeId,
        quantity: n,
      });
      if (!r.ok) {
        onError(r.error);
        return;
      }
      setPartTypeId("");
      setQty("1");
      onChange();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={partTypeId} onValueChange={setPartTypeId}>
        <SelectTrigger size="sm" className="w-[160px]" aria-label="Part type">
          <SelectValue placeholder="Part type…" />
        </SelectTrigger>
        <SelectContent>
          {partTypes.length === 0 ? (
            <div className="text-muted-foreground p-2 text-xs">
              Every part type is already declared.
            </div>
          ) : (
            partTypes.map((pt) => (
              <SelectItem key={pt.id} value={pt.id}>
                {pt.name_en}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        disabled={isPending}
        className="h-8 w-16 tabular-nums"
        aria-label="Quantity per bike"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onAdd}
        disabled={isPending || partTypeId === ""}
      >
        <Plus aria-hidden /> Add
      </Button>
    </div>
  );
}
