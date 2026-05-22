"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColorSwatch } from "@/components/color-swatch";
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

import { setColorActive } from "../_actions/manage-colors";
import { ColorDialog, type ColorDialogInitial } from "./color-dialog";

export type ColorRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameDa: string;
  hex: string | null;
  ralCode: string | null;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; initial: ColorDialogInitial };

export function ColorsSection({ rows }: { rows: ColorRow[] }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [error, setError] = useState<string | null>(null);
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Colours</h2>
          <span className="text-muted-foreground text-xs">
            {activeCount} active · {rows.length} total
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDialog({ kind: "create" })}
        >
          <Plus aria-hidden /> Add colour
        </Button>
      </header>

      {error ? (
        <p className="text-destructive border-b px-4 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No colours yet. Add one to start.
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colour</TableHead>
                <TableHead className="hidden sm:table-cell">Slug</TableHead>
                <TableHead className="hidden md:table-cell">RAL</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Sort
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  In use
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ColorTableRow
                  key={row.id}
                  row={row}
                  onEdit={() =>
                    setDialog({
                      kind: "edit",
                      initial: {
                        id: row.id,
                        name_en: row.nameEn,
                        name_da: row.nameDa,
                        slug: row.slug,
                        hex: row.hex,
                        ralCode: row.ralCode,
                        sortOrder: row.sortOrder,
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
        <ColorDialog
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

function ColorTableRow({
  row,
  onEdit,
  onError,
}: {
  row: ColorRow;
  onEdit: () => void;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function runToggleActive() {
    onError(null);
    start(async () => {
      const r = await setColorActive(row.id, !row.isActive);
      if (!r.ok) {
        onError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <TableRow className={row.isActive ? undefined : "opacity-60"}>
      <TableCell>
        <div className="flex items-center gap-2">
          {row.hex ? (
            <ColorSwatch hex={row.hex} label={row.nameEn} />
          ) : (
            <span className="bg-muted inline-block size-4 rounded border" />
          )}
          <div className="flex flex-col">
            <span className="font-medium">{row.nameEn}</span>
            {row.nameDa && row.nameDa !== row.nameEn ? (
              <span className="text-muted-foreground text-xs">
                {row.nameDa}
              </span>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden font-mono text-xs sm:table-cell">
        {row.slug}
      </TableCell>
      <TableCell className="hidden text-xs md:table-cell">
        {row.ralCode ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {row.sortOrder}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums lg:table-cell">
        {row.usageCount}
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
              aria-label={`Actions for ${row.nameEn}`}
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
            <DropdownMenuItem
              variant={row.isActive ? "destructive" : "default"}
              disabled={pending}
              onSelect={(e) => {
                e.preventDefault();
                runToggleActive();
              }}
              title={
                row.isActive && row.usageCount > 0
                  ? `${row.usageCount} bikes / MOs use this colour. Archiving hides it from new pickers; existing records keep their reference.`
                  : undefined
              }
            >
              {row.isActive ? "Archive" : "Restore"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
