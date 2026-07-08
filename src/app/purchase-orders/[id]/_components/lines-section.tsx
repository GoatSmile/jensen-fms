"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import { formatFxRate, formatPct } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import { formatQuantity } from "@/lib/parts/stock";
import type { PurchaseOrderStatus } from "@/lib/po/status";
import {
  IMPORT_TAX_BASIS_LABELS,
  type ImportTaxBasis,
} from "@/lib/purchasing/import-tax";

import { deleteLine } from "../_actions/manage-lines";
import {
  LineDialog,
  type CurrencyChoice,
  type LineDialogInitial,
  type PartChoice,
} from "./line-dialog";

export type POLineRow = {
  id: string;
  partId: string;
  partSku: string;
  partName: string;
  quantity: number;
  /** Nullable — a PO request can be created before the supplier quotes a price. */
  unitPrice: number | null;
  currency: string;
  fxRateToDkk: number;
  /** Decimal 0.10 = 10 %. */
  transportPct: number;
  /** Decimal — import duty snapshotted from the part's HS code. */
  tariffPct: number;
  /** Decimal — EU anti-dumping duty (0 = none). Snapshotted alongside
   *  tariffPct and added into the landed-cost formula. */
  antiDumpingPct: number;
  /** Frozen reason behind the import-tax snapshot (null = pre-migration-54). */
  importTaxBasis: ImportTaxBasis | null;
  /** Nullable — NULL while the line's unit_price is blank (price pending). */
  landedDkkPerUnit: number | null;
  receivedQuantity: number;
  notes: string | null;
};

type Props = {
  poId: string;
  status: PurchaseOrderStatus;
  /** PO's order_date — drives historical FX lookup in the line dialog. */
  orderDate: string;
  totalCurrency: string | null;
  rows: POLineRow[];
  partsCatalog: PartChoice[];
  currencies: CurrencyChoice[];
  fxRatesByCurrency: Record<string, number>;
  defaultTransportPct: number;
  /** Supplier's import_duty_prepaid_default — feeds the line dialog's default. */
  supplierDutyPrepaid: boolean;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; initial: LineDialogInitial };

export function LinesSection({
  poId,
  status,
  orderDate,
  totalCurrency,
  rows,
  partsCatalog,
  currencies,
  fxRatesByCurrency,
  defaultTransportPct,
  supplierDutyPrepaid,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const isDraft = status === "draft";

  // Disable parts already on the PO in the add-mode picker so the user can't
  // create a duplicate. Edit mode passes its own excludeIds (excluding itself).
  const onPoPartIds = new Set(rows.map((r) => r.partId));

  function runDelete(lineId: string) {
    setError(null);
    startDelete(async () => {
      const r = await deleteLine(lineId);
      if (!r.ok) {
        setError(r.error);
        setPendingDeleteId(null);
        return;
      }
      setPendingDeleteId(null);
      router.refresh();
    });
  }

  const description = isDraft
    ? "Editable while draft. Once you move the PO to placed, lines lock and only the receive flow can change them."
    : status === "cancelled"
      ? "This PO is cancelled — lines are read-only."
      : status === "received"
        ? "This PO is fully received — lines are read-only."
        : "Lines are locked. Use the receive flow below to log incoming stock.";

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Lines</h2>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        {isDraft ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialog({ kind: "add" })}
          >
            <Plus aria-hidden /> Add line
          </Button>
        ) : null}
      </header>

      <div className="p-4">
        {error ? (
          <p className="text-destructive mb-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
            {isDraft
              ? "No lines yet — add the first one to get started."
              : "No lines on this PO."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border md:overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  {/* Unit price is just a step on the way to landed DKK.
                      Hide on phones; show on sm+. */}
                  <TableHead className="hidden text-right sm:table-cell">
                    Unit price
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    FX rate
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Transport
                  </TableHead>
                  <TableHead className="text-right">Landed DKK/unit</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Received
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                  {isDraft ? <TableHead className="w-[40px]" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const foreignCurrency =
                    totalCurrency && row.currency !== totalCurrency;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-0 whitespace-normal">
                        <Link
                          href={`/parts/${row.partId}`}
                          className="font-medium break-words hover:underline"
                        >
                          {row.partName}
                        </Link>
                        <div className="text-muted-foreground font-mono text-xs break-all">
                          {row.partSku}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(row.quantity)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {row.unitPrice == null ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            price pending
                          </span>
                        ) : (
                          <>
                            <div>
                              <Money
                                amount={row.unitPrice}
                                currency={row.currency}
                                fractionDigits={4}
                                bold={false}
                              />
                            </div>
                            {foreignCurrency ? (
                              <div className="text-muted-foreground text-[10px]">
                                in {row.currency}
                              </div>
                            ) : null}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {formatFxRate(row.fxRateToDkk)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {formatPct(row.transportPct)}
                        {row.tariffPct > 0 ? (
                          <div className="text-muted-foreground text-[10px]">
                            + {formatPct(row.tariffPct)} tariff
                          </div>
                        ) : null}
                        {row.antiDumpingPct > 0 ? (
                          <div className="text-destructive text-[10px]">
                            + {formatPct(row.antiDumpingPct)} anti-dumping
                          </div>
                        ) : null}
                        {/* Why a line carries no import tax — a correct zero
                            (EU origin / duty prepaid / zero-rated) reads
                            differently from a data-quality gap (unclassified,
                            amber: understates landed cost). */}
                        {row.tariffPct === 0 &&
                        row.importTaxBasis != null &&
                        row.importTaxBasis !== "applied" ? (
                          <div
                            className={
                              row.importTaxBasis === "unclassified"
                                ? "text-[10px] text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground text-[10px]"
                            }
                          >
                            no import tax —{" "}
                            {IMPORT_TAX_BASIS_LABELS[row.importTaxBasis]}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(row.landedDkkPerUnit, "DKK")}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {formatQuantity(row.receivedQuantity)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-[180px] truncate text-xs md:table-cell">
                        {row.notes ?? "—"}
                      </TableCell>
                      {isDraft ? (
                        <TableCell className="text-right">
                          <RowActions
                            row={row}
                            onEdit={() =>
                              setDialog({
                                kind: "edit",
                                initial: rowToInitial(row),
                              })
                            }
                            confirming={pendingDeleteId === row.id}
                            pending={
                              isDeleting && pendingDeleteId === row.id
                            }
                            onAskDelete={() => setPendingDeleteId(row.id)}
                            onConfirmDelete={() => runDelete(row.id)}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {dialog.kind !== "closed" ? (
        <LineDialog
          key={
            dialog.kind === "add"
              ? "line-add"
              : `line-edit-${dialog.initial.lineId}`
          }
          open
          onOpenChange={(next) => {
            if (!next) setDialog({ kind: "closed" });
          }}
          mode={
            dialog.kind === "add"
              ? { kind: "add", poId }
              : { kind: "edit", initial: dialog.initial }
          }
          parts={partsCatalog}
          currencies={currencies}
          fxRatesByCurrency={fxRatesByCurrency}
          defaultTransportPct={defaultTransportPct}
          orderDate={orderDate}
          supplierDutyPrepaid={supplierDutyPrepaid}
          excludePartIds={
            dialog.kind === "add"
              ? onPoPartIds
              : // Edit mode: exclude every other line's part so the user can't
                // collide with a sibling row. The current row's part is locked
                // anyway (the dialog disables the picker), but we keep the
                // set tidy.
                new Set(
                  rows
                    .filter((r) => r.id !== dialog.initial.lineId)
                    .map((r) => r.partId),
                )
          }
        />
      ) : null}
    </section>
  );
}

function rowToInitial(row: POLineRow): LineDialogInitial {
  return {
    lineId: row.id,
    partId: row.partId,
    partLabel: `${row.partName} · ${row.partSku}`,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    currency: row.currency,
    fxRateToDkk: row.fxRateToDkk,
    transportPct: row.transportPct,
    tariffPct: row.tariffPct,
    antiDumpingPct: row.antiDumpingPct,
    importTaxBasis: row.importTaxBasis,
    notes: row.notes,
  };
}

function RowActions({
  row,
  onEdit,
  confirming,
  pending,
  onAskDelete,
  onConfirmDelete,
}: {
  row: POLineRow;
  onEdit: () => void;
  confirming: boolean;
  pending: boolean;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Actions for ${row.partSku}`}
          disabled={pending}
        >
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onEdit();
          }}
        >
          <Pencil aria-hidden /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={(e) => {
            e.preventDefault();
            if (confirming) onConfirmDelete();
            else onAskDelete();
          }}
        >
          <Trash2 aria-hidden />{" "}
          {confirming ? "Click again to confirm" : "Remove"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
