"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
import { Panel } from "@/components/ui/panel";
import { formatPrice } from "@/lib/format";
import { formatQuantity } from "@/lib/parts/stock";
import { LineDialog } from "@/components/commercial/line-dialog";
import type {
  ColorChoice,
  CommercialLineResult,
  CommercialLineRow,
  LineDialogInitial,
  PartChoice,
  TemplateChoice,
  VatCodeChoice,
} from "@/lib/commercial/lines";

/**
 * The lines panel of a commercial document (offer or sales order): the table,
 * the add/edit dialog and the delete confirm.
 *
 * Everything document-SPECIFIC arrives as a prop rather than a branch — the
 * panel's own wording, the three writers, and three render slots for UI that
 * belongs to one document only (a sales order's MO badge and its "Spawn MO"
 * row action; an offer's per-line picture). A new document type therefore adds
 * nothing here, which is the whole reason this file exists instead of a third
 * copy.
 */

/** Helpers handed to the render slots so document-specific UI reports errors
 *  into the panel's single error line rather than growing its own. */
export type LineSlotHelpers = {
  onError: (message: string | null) => void;
  onAfterAction: () => void;
  pending: boolean;
};

type Props = {
  title: string;
  description: string;
  currency: string;
  defaultVatCode: string | null;
  editable: boolean;
  rows: CommercialLineRow[];
  parts: PartChoice[];
  templates: TemplateChoice[];
  vatCodes: VatCodeChoice[];
  colors: ColorChoice[];
  onAdd: (fd: FormData) => Promise<CommercialLineResult>;
  onUpdate: (lineId: string, fd: FormData) => Promise<CommercialLineResult>;
  onDelete: (lineId: string) => Promise<CommercialLineResult>;
  /** Rendered beside the item name — e.g. the offer's line picture. */
  renderItemExtra?: (row: CommercialLineRow, h: LineSlotHelpers) => ReactNode;
  /** Rendered under the item name — e.g. the SO's linked-MO badge. */
  renderItemBadges?: (row: CommercialLineRow) => ReactNode;
  /**
   * Rendered in the actions column, immediately left of the ⋯ menu — e.g. the
   * SO's "Spawn MO" button. Unlike the ⋯ menu it does NOT depend on `editable`,
   * so a row action stays available on a locked document when its own rule
   * allows it.
   */
  renderRowActions?: (row: CommercialLineRow, h: LineSlotHelpers) => ReactNode;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; initial: LineDialogInitial };

export function CommercialLinesSection({
  title,
  description,
  currency,
  defaultVatCode,
  editable,
  rows,
  parts,
  templates,
  vatCodes,
  colors,
  onAdd,
  onUpdate,
  onDelete,
  renderItemExtra,
  renderItemBadges,
  renderRowActions,
}: Props) {
  const t = useTranslations("commercialLines");
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel
      title={title}
      description={description}
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
              <TableHead className="w-[1%] whitespace-nowrap" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <LineTableRow
                key={row.id}
                row={row}
                currency={currency}
                editable={editable}
                onDelete={onDelete}
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
                renderItemExtra={renderItemExtra}
                renderItemBadges={renderItemBadges}
                renderRowActions={renderRowActions}
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
          initial={dialog.kind === "edit" ? dialog.initial : null}
          defaultVatCode={defaultVatCode}
          currency={currency}
          onSubmit={
            dialog.kind === "add"
              ? onAdd
              : (fd) => onUpdate(dialog.initial.lineId, fd)
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

function LineTableRow({
  row,
  currency,
  editable,
  onDelete,
  onEdit,
  onError,
  onAfterAction,
  renderItemExtra,
  renderItemBadges,
  renderRowActions,
}: {
  row: CommercialLineRow;
  currency: string;
  editable: boolean;
  onDelete: (lineId: string) => Promise<CommercialLineResult>;
  onEdit: () => void;
  onError: (msg: string | null) => void;
  onAfterAction: () => void;
  renderItemExtra?: (row: CommercialLineRow, h: LineSlotHelpers) => ReactNode;
  renderItemBadges?: (row: CommercialLineRow) => ReactNode;
  renderRowActions?: (row: CommercialLineRow, h: LineSlotHelpers) => ReactNode;
}) {
  const t = useTranslations("commercialLines");
  const tCommon = useTranslations("common");
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function runDelete() {
    onError(null);
    start(async () => {
      const r = await onDelete(row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmDelete(false);
        return;
      }
      onAfterAction();
    });
  }

  const slotHelpers: LineSlotHelpers = { onError, onAfterAction, pending };

  return (
    <TableRow>
      <TableCell className="text-muted-foreground text-xs tabular-nums">
        {row.lineNumber}
      </TableCell>
      <TableCell className="min-w-0 whitespace-normal">
        {row.kind === "template" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/bike-templates/${row.bikeTemplateId}`}
                className="font-medium break-words hover:underline"
              >
                {row.templateLabel ?? "—"}
              </Link>
              {renderItemExtra?.(row, slotHelpers)}
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
        {renderItemBadges?.(row)}
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
      <TableCell className="text-right font-medium tabular-nums">
        {formatPrice(row.total, currency)}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {/* Row actions sit OUTSIDE the `editable` gate: the SO's "Spawn MO"
            has its own rule (template line, no MO yet) and stays available on a
            confirmed order, where the ⋯ menu is correctly gone. */}
        <div className="flex items-center justify-end gap-2">
          {renderRowActions?.(row, slotHelpers)}
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
                  {confirmDelete ? tCommon("confirmRepeat") : t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
