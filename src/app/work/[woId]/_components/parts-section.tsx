"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { removePartFromWO } from "@/app/maintenance/work-orders/[id]/_actions/manage-wo-parts";

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
  readOnly: boolean;
};

/**
 * Parts-used section on the technician workspace. Compact list of
 * already-consumed parts; "Add parts" navigates to the dedicated
 * full-screen add-parts page (kit shortcuts, multi-add, steppers).
 */
export function PartsSection({ woId, rows, readOnly }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
    <section className="bg-card flex flex-col gap-3 rounded-md border border-l-[3px] border-l-indigo-600 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-indigo-600" aria-hidden />
          <h2 className="text-sm font-semibold">Parts used</h2>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {rows.length === 0 ? (
              "None yet"
            ) : (
              <>
                {rows.length} ·{" "}
                <Money amount={totalCost} currency="DKK" bold={false} />
              </>
            )}
          </span>
        </div>
        {!readOnly ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/work/${woId}/parts`}>
              <Plus className="size-4" aria-hidden /> Add parts
            </Link>
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
                      <Money
                        amount={row.unitPrice}
                        currency="DKK"
                        bold={false}
                      />
                    </div>
                    {lineTotal != null ? (
                      <div className="text-muted-foreground text-xs">
                        ={" "}
                        <Money
                          amount={lineTotal}
                          currency="DKK"
                          bold={false}
                        />
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
    </section>
  );
}
