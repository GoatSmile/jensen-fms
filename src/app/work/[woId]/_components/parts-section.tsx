"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/parts/format";
import { removePartFromWO } from "@/app/maintenance/work-orders/[id]/_actions/manage-wo-parts";
import {
  WOPartDialog,
  type PartChoice,
} from "@/app/maintenance/work-orders/[id]/_components/wo-part-dialog";

export type WOPartRow = {
  id: string;
  partId: string;
  partSku: string;
  partName: string;
  quantity: number;
  unitPrice: number | null;
};

type Props = {
  woId: string;
  rows: WOPartRow[];
  partsCatalog: PartChoice[];
  lastCostByPartId: Map<string, number>;
  readOnly: boolean;
};

/**
 * Parts-used section on the technician workspace. Compact list of
 * already-consumed parts plus an "Add part" button that opens the
 * shared WOPartDialog (which writes both the work_order_parts row and
 * the consuming inventory_movement).
 */
export function PartsSection({
  woId,
  rows,
  partsCatalog,
  lastCostByPartId,
  readOnly,
}: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const excludeIds = new Set(rows.map((r) => r.partId));
  const totalCost = rows.reduce(
    (s, r) => s + (r.unitPrice != null ? r.unitPrice * r.quantity : 0),
    0,
  );

  function onRemove(rowId: string) {
    setError(null);
    setRemovingId(rowId);
    start(async () => {
      const r = await removePartFromWO(woId, rowId);
      setRemovingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="bg-card flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="text-muted-foreground size-4" aria-hidden />
          <h2 className="text-sm font-semibold">Parts used</h2>
          <span className="text-muted-foreground text-xs">
            {rows.length === 0
              ? "None yet"
              : `${rows.length} · ${formatMoney(totalCost, "DKK")}`}
          </span>
        </div>
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="size-4" aria-hidden /> Add part
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm italic">
          No parts consumed yet. Add the parts you actually used so the
          bike&rsquo;s service history and the invoice match.
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const lineTotal =
              row.unitPrice != null ? row.unitPrice * row.quantity : null;
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{row.partName}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {row.partSku}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="text-right">
                    <div className="tabular-nums text-sm">
                      {row.quantity} ×{" "}
                      {row.unitPrice != null
                        ? formatMoney(row.unitPrice, "DKK")
                        : "—"}
                    </div>
                    {lineTotal != null ? (
                      <div className="text-muted-foreground text-xs tabular-nums">
                        = {formatMoney(lineTotal, "DKK")}
                      </div>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${row.partName}`}
                      onClick={() => onRemove(row.id)}
                      disabled={pending && removingId === row.id}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialogOpen ? (
        <WOPartDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          woId={woId}
          parts={partsCatalog}
          excludeIds={excludeIds}
          lastCostByPartId={lastCostByPartId}
        />
      ) : null}
    </section>
  );
}
