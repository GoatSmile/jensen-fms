"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Plus } from "lucide-react";

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
import { formatPct } from "@/lib/parts/format";

import { archiveHsCode } from "../_actions/manage-hs-codes";
import {
  HsCodeDialog,
  type HsCodeDialogInitial,
} from "./hs-code-dialog";

export type HsCodeRow = {
  id: string;
  code: string;
  description: string;
  tariffPct: number;
  notes: string | null;
  isActive: boolean;
  partCount: number;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; initial: HsCodeDialogInitial };

export function HsCodesSection({ rows }: { rows: HsCodeRow[] }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(
    () => rows.filter((r) => r.isActive).length,
    [rows],
  );

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">HS / TARIC codes</h2>
          <span className="text-muted-foreground text-xs">
            {activeCount} active · {rows.length} total
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDialog({ kind: "create" })}
        >
          <Plus aria-hidden /> Add code
        </Button>
      </header>

      {error ? (
        <p className="text-destructive border-b px-4 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No HS codes yet. Add one to start classifying parts.
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Tariff</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Parts
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <HsCodeTableRow
                  key={row.id}
                  row={row}
                  onEdit={() =>
                    setDialog({
                      kind: "edit",
                      initial: {
                        id: row.id,
                        code: row.code,
                        description: row.description,
                        tariffPct: row.tariffPct,
                        notes: row.notes,
                        isActive: row.isActive,
                      },
                    })
                  }
                  onError={setError}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog.kind !== "closed" ? (
        <HsCodeDialog
          // Re-key so create/edit dialogs reset cleanly between launches.
          key={
            dialog.kind === "create" ? "create" : `edit-${dialog.initial.id}`
          }
          open
          onOpenChange={(next) => {
            if (!next) setDialog({ kind: "closed" });
          }}
          mode={
            dialog.kind === "create"
              ? { kind: "create" }
              : { kind: "edit", initial: dialog.initial }
          }
        />
      ) : null}
    </section>
  );
}

function HsCodeTableRow({
  row,
  onEdit,
  onError,
}: {
  row: HsCodeRow;
  onEdit: () => void;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  function runArchive() {
    onError(null);
    start(async () => {
      const r = await archiveHsCode(row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmArchive(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.code}</TableCell>
      <TableCell className="text-sm">
        {row.description}
        {row.notes ? (
          <div className="text-muted-foreground text-xs">{row.notes}</div>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatPct(row.tariffPct)}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {row.partCount}
      </TableCell>
      <TableCell>
        {row.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="outline">Archived</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Actions for ${row.code}`}
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
              Edit
            </DropdownMenuItem>
            {row.isActive ? (
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onSelect={(e) => {
                  e.preventDefault();
                  if (confirmArchive) runArchive();
                  else setConfirmArchive(true);
                }}
                title={
                  row.partCount > 0
                    ? "Existing parts keep their classification; archive only hides this code from pickers."
                    : undefined
                }
              >
                {confirmArchive ? "Click again to confirm" : "Archive"}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
