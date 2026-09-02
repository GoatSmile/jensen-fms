"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Hammer, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

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
import { Panel } from "@/components/ui/panel";
import { formatPrice } from "@/lib/format";
import { formatQuantity } from "@/lib/parts/stock";

import { deleteSOLine } from "../../_actions/manage-so-lines";
import { spawnMOFromSOLine } from "../../_actions/spawn-mo";
import {
  LineDialog,
  type ColorChoice,
  type LineDialogInitial,
  type PartChoice,
  type TemplateChoice,
  type VatCodeChoice,
} from "./line-dialog";

export type SOLineRow = {
  id: string;
  lineNumber: number;
  kind: "part" | "template";
  partId: string | null;
  partSku: string | null;
  partName: string | null;
  bikeTemplateId: string | null;
  templateLabel: string | null;
  colorId: string | null;
  colorName: string | null;
  quantity: number;
  unitPrice: number;
  vatCode: string | null;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  descriptionEn: string | null;
  descriptionDa: string | null;
  /** Active MOs (not cancelled) spawned from this line. Drives the
   *  "spawn MO" CTA visibility. */
  linkedMoCount: number;
};

type Props = {
  soId: string;
  currency: string;
  defaultVatCode: string | null;
  editable: boolean;
  /** When true, "Spawn MO" is shown on template lines that don't already
   *  have an active MO. Allowed in draft/confirmed/in_production. */
  canSpawn: boolean;
  rows: SOLineRow[];
  parts: PartChoice[];
  templates: TemplateChoice[];
  vatCodes: VatCodeChoice[];
  colors: ColorChoice[];
};

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; initial: LineDialogInitial };

export function LinesSection({
  soId,
  currency,
  defaultVatCode,
  editable,
  canSpawn,
  rows,
  parts,
  templates,
  vatCodes,
  colors,
}: Props) {
  const t = useTranslations("soDetail");
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel
      title={t("linesTitle")}
      description={editable ? t("linesDescEditable") : t("linesDescLocked")}
      action={
        editable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialog({ kind: "add" })}
          >
            <Plus aria-hidden /> {t("addLine")}
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          {editable ? t("noLinesEditable") : t("noLines")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36px]">#</TableHead>
              <TableHead>{t("thItem")}</TableHead>
              <TableHead className="text-right">{t("thQty")}</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                {t("thUnitPrice")}
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                {t("thVat")}
              </TableHead>
              <TableHead className="text-right">{t("thLineTotal")}</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <SOLineTableRow
                key={row.id}
                soId={soId}
                row={row}
                currency={currency}
                editable={editable}
                canSpawn={canSpawn}
                onEdit={() =>
                  setDialog({
                    kind: "edit",
                    initial: {
                      lineId: row.id,
                      kind: row.kind,
                      partId: row.partId,
                      bikeTemplateId: row.bikeTemplateId,
                      quantity: row.quantity,
                      unitPrice: row.unitPrice,
                      vatCode: row.vatCode,
                      colorId: row.colorId,
                      descriptionEn: row.descriptionEn,
                      descriptionDa: row.descriptionDa,
                    },
                  })
                }
                onError={setError}
                onAfterAction={() => router.refresh()}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {dialog.kind !== "closed" ? (
        <LineDialog
          key={dialog.kind === "add" ? "add" : `edit-${dialog.initial.lineId}`}
          open
          onOpenChange={(next) => {
            if (!next) setDialog({ kind: "closed" });
          }}
          mode={
            dialog.kind === "add"
              ? {
                  kind: "add",
                  soId,
                  defaultVatCode,
                  soCurrency: currency,
                }
              : {
                  kind: "edit",
                  initial: dialog.initial,
                  defaultVatCode,
                  soCurrency: currency,
                }
          }
          parts={parts}
          templates={templates}
          vatCodes={vatCodes}
          colors={colors}
        />
      ) : null}
    </Panel>
  );
}

function SOLineTableRow({
  soId,
  row,
  currency,
  editable,
  canSpawn,
  onEdit,
  onError,
  onAfterAction,
}: {
  soId: string;
  row: SOLineRow;
  currency: string;
  editable: boolean;
  canSpawn: boolean;
  onEdit: () => void;
  onError: (msg: string | null) => void;
  onAfterAction: () => void;
}) {
  const t = useTranslations("soDetail");
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function runDelete() {
    onError(null);
    start(async () => {
      const r = await deleteSOLine(row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmDelete(false);
        return;
      }
      onAfterAction();
    });
  }

  function runSpawn() {
    onError(null);
    start(async () => {
      const r = await spawnMOFromSOLine(soId, row.id);
      if (r && !r.ok) onError(r.error);
      // ok path redirects, no need to refresh here
    });
  }

  const canSpawnHere =
    canSpawn && row.kind === "template" && row.linkedMoCount === 0;

  return (
    <TableRow>
      <TableCell className="text-muted-foreground tabular-nums text-xs">
        {row.lineNumber}
      </TableCell>
      <TableCell className="min-w-0 whitespace-normal">
        {row.kind === "template" ? (
          <>
            {/* Spawn MO sits BESIDE the template, not in the row's ⋯ menu
                (owner, 2026-09-02): it is the one action that turns a sold
                line into work on the floor, and a line that has never been
                spawned looks identical to one that has until you open the
                menu. It renders only while it can fire — template line, no MO
                yet — so its presence is the state. */}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/bike-templates/${row.bikeTemplateId}`}
                className="font-medium break-words hover:underline"
              >
                {row.templateLabel ?? "—"}
              </Link>
              {canSpawnHere ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={runSpawn}
                  disabled={pending}
                >
                  <Hammer aria-hidden /> {t("spawnMo")}
                </Button>
              ) : null}
            </div>
            <div className="text-muted-foreground text-[10px]">
              {t("bikeTemplate")}
              {row.colorName ? ` · ${row.colorName}` : ""}
            </div>
          </>
        ) : (
          <>
            <Link
              href={`/parts/${row.partId}`}
              className="font-medium break-words hover:underline"
            >
              {row.partName ?? "—"}
            </Link>
            <div className="text-muted-foreground font-mono text-[10px] break-all">
              {row.partSku}
            </div>
          </>
        )}
        {row.linkedMoCount > 0 ? (
          <Badge variant="secondary" className="mt-1 text-[10px]">
            {t("moBadge", { count: row.linkedMoCount })}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatQuantity(row.quantity)}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {formatPrice(row.unitPrice, currency)}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums lg:table-cell">
        {row.vatCode ? (
          <>
            <div className="font-mono text-xs">{row.vatCode}</div>
            <div className="text-muted-foreground text-[10px]">
              {row.vatRate}%
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {formatPrice(row.total, currency)}
      </TableCell>
      <TableCell className="text-right">
        {editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("lineActionsAria")}
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
                <Pencil aria-hidden /> {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onSelect={(e) => {
                  e.preventDefault();
                  if (confirmDelete) runDelete();
                  else setConfirmDelete(true);
                }}
              >
                <Trash2 aria-hidden />{" "}
                {confirmDelete ? t("clickAgainConfirm") : t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
