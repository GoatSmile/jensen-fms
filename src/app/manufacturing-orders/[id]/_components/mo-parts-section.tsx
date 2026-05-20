"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRightLeft, MoreVertical, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { formatQuantity } from "@/lib/parts/stock";

import { removeMOPart } from "../_actions/manage-mo-parts";
import {
  SubstitutePartDialog,
  type PartChoice,
} from "./substitute-part-dialog";
import { Section } from "./section";

export type MOPartRow = {
  id: string;
  partId: string;
  partSku: string;
  partName: string;
  quantityPerBike: number;
  origin: "template" | "added" | "substituted" | "modified";
  substitutedFromPartName: string | null;
  notes: string | null;
  onHand: number;
};

type Props = {
  moId: string;
  rows: MOPartRow[];
  outstandingBikes: number;
  partsCatalog: PartChoice[];
  /** True when the MO is template-driven; false for one-off builds. */
  hasTemplate: boolean;
  /** Hide write actions when the MO is completed/cancelled. */
  readOnly: boolean;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "substitute"; rowId: string; partName: string; qty: number };

export function MOPartsSection({
  moId,
  rows,
  outstandingBikes,
  partsCatalog,
  hasTemplate,
  readOnly,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });

  const onMoPartIds = new Set(rows.map((r) => r.partId));

  return (
    <Section
      title="Parts recipe"
      description={
        hasTemplate
          ? "The qty per bike comes from the template (or your edits). On-hand is summed across all locations; shortfall is highlighted."
          : "One-off build — assemble the parts list by hand. On-hand is summed across all locations; shortfall is highlighted."
      }
      action={
        readOnly ? null : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialog({ kind: "add" })}
          >
            <Plus aria-hidden /> Add part
          </Button>
        )
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
          No parts on this MO yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead className="text-right">Qty / bike</TableHead>
                <TableHead className="text-right">
                  Total needed
                  <span className="text-muted-foreground ml-1 text-[10px]">
                    (× {outstandingBikes} outstanding)
                  </span>
                </TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Shortfall</TableHead>
                <TableHead>Origin</TableHead>
                {readOnly ? null : <TableHead className="w-[40px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const totalNeeded = row.quantityPerBike * outstandingBikes;
                const shortfall = Math.max(0, totalNeeded - row.onHand);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/parts/${row.partId}`}
                        className="font-medium hover:underline"
                      >
                        {row.partName}
                      </Link>
                      <div className="text-muted-foreground font-mono text-xs">
                        {row.partSku}
                      </div>
                      {row.substitutedFromPartName ? (
                        <div className="text-muted-foreground mt-0.5 text-xs italic">
                          replaces {row.substitutedFromPartName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.quantityPerBike)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(totalNeeded)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.onHand)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        shortfall > 0
                          ? "text-destructive font-medium"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {shortfall > 0 ? formatQuantity(shortfall) : "—"}
                    </TableCell>
                    <TableCell>
                      <OriginBadge origin={row.origin} />
                    </TableCell>
                    {readOnly ? null : (
                      <TableCell className="text-right">
                        <RowActions
                          moId={moId}
                          row={row}
                          onSubstitute={() =>
                            setDialog({
                              kind: "substitute",
                              rowId: row.id,
                              partName: row.partName,
                              qty: row.quantityPerBike,
                            })
                          }
                          onError={setError}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog.kind !== "closed" ? (
        <SubstitutePartDialog
          // Re-key to fully reset between Add / Substitute clicks.
          key={
            dialog.kind === "add"
              ? "add"
              : `sub-${dialog.rowId}`
          }
          open
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "closed" });
          }}
          moId={moId}
          mode={
            dialog.kind === "add"
              ? { kind: "add" }
              : {
                  kind: "substitute",
                  originalRowId: dialog.rowId,
                  originalPartName: dialog.partName,
                  originalQty: dialog.qty,
                }
          }
          parts={partsCatalog}
          excludeIds={onMoPartIds}
        />
      ) : null}
    </Section>
  );
}

function OriginBadge({ origin }: { origin: MOPartRow["origin"] }) {
  if (origin === "template") {
    return (
      <Badge variant="outline" className="font-normal">
        from template
      </Badge>
    );
  }
  if (origin === "added") {
    return <Badge variant="secondary">added</Badge>;
  }
  if (origin === "substituted") {
    return <Badge variant="warning">substituted</Badge>;
  }
  return <Badge variant="secondary">{origin}</Badge>;
}

function RowActions({
  moId,
  row,
  onSubstitute,
  onError,
}: {
  moId: string;
  row: MOPartRow;
  onSubstitute: () => void;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removeMOPart(moId, row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmRemove(false);
      } else router.refresh();
    });
  }

  const removable = row.origin !== "template";

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
            onSubstitute();
          }}
        >
          <ArrowRightLeft aria-hidden /> Substitute
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!removable || pending}
          title={
            !removable
              ? "Template-origin parts can't be removed; substitute instead."
              : undefined
          }
          onSelect={(e) => {
            e.preventDefault();
            if (!removable) return;
            if (confirmRemove) runRemove();
            else setConfirmRemove(true);
          }}
        >
          <Trash2 aria-hidden />{" "}
          {confirmRemove ? "Click again to confirm" : "Remove"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
