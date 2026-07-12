"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, MoreVertical } from "lucide-react";

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
import { EmptyState } from "@/components/empty-state";

import { archiveUnit } from "../_actions/manage-units";
import { EMPTY_UNIT, UnitDialog, type UnitDialogValues } from "./unit-dialog";

export type UnitRow = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  notes: string | null;
  bikeCount: number;
};

type Props = {
  organizationId: string;
  rows: UnitRow[];
};

export function UnitsSection({ organizationId, rows }: Props) {
  const t = useTranslations("units");
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingRow = useMemo(
    () => rows.find((r) => r.id === editingId) ?? null,
    [rows, editingId],
  );

  function handleEditOpenChange(next: boolean) {
    if (!next) setEditingId(null);
  }

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <span className="text-muted-foreground text-xs">
            {t("count", { count: rows.length })}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          {t("addSubUnit")}
        </Button>
      </header>

      {error ? (
        <p className="text-destructive border-b px-4 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Building2}
            title={t("emptyTitle")}
            description={t("emptyDesc")}
          />
        </div>
      ) : (
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thName")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("thCode")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("thAddress")}</TableHead>
                <TableHead className="w-[80px] text-right">{t("thBikes")}</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <UnitTableRow
                  key={row.id}
                  row={row}
                  onEdit={() => setEditingId(row.id)}
                  onError={setError}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <UnitDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        organizationId={organizationId}
        initial={EMPTY_UNIT}
      />
      {editingRow ? (
        <UnitDialog
          open={editingId !== null}
          onOpenChange={handleEditOpenChange}
          mode="edit"
          organizationId={organizationId}
          unitId={editingRow.id}
          initial={unitRowToValues(editingRow)}
        />
      ) : null}
    </section>
  );
}

function unitRowToValues(row: UnitRow): UnitDialogValues {
  return {
    name: row.name,
    code: row.code ?? "",
    address: row.address ?? "",
    notes: row.notes ?? "",
  };
}

function UnitTableRow({
  row,
  onEdit,
  onError,
}: {
  row: UnitRow;
  onEdit: () => void;
  onError: (msg: string | null) => void;
}) {
  const t = useTranslations("units");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  function runArchive() {
    onError(null);
    start(async () => {
      const r = await archiveUnit(row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmArchive(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="text-sm">{row.name}</TableCell>
      <TableCell className="hidden font-mono text-xs lg:table-cell">
        {row.code ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="hidden text-sm md:table-cell">
        {row.address ? (
          <span className="text-muted-foreground whitespace-pre-wrap">
            {row.address}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {row.bikeCount}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("actionsFor", { name: row.name })}
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
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onSelect={(e) => {
                e.preventDefault();
                if (confirmArchive) runArchive();
                else setConfirmArchive(true);
              }}
            >
              {confirmArchive ? tCommon("confirmRepeat") : t("archive")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
