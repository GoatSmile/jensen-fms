"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Plus, Star, Trash2 } from "lucide-react";

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
import { Money } from "@/components/money";
import { formatPriceWithDkk } from "@/lib/format";

import {
  deleteOffering,
  setPreferredOffering,
} from "../_actions/offerings";
import {
  EMPTY_OFFERING_VALUES,
  OfferingDialog,
  type CurrencyOption,
  type OfferingValues,
  type SupplierOption,
} from "./offering-dialog";
import { EmptyRow, Section } from "./section";

export type OfferingRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierSku: string | null;
  defaultPurchasePrice: number | null;
  defaultPurchaseCurrency: string | null;
  /** Frozen-FX rate to DKK for the offering's currency. Null if unknown. */
  fxRateToDkk: number | null;
  minimumOrderQuantity: number | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  notes: string | null;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; offering: OfferingRow };

type Props = {
  partId: string;
  rows: OfferingRow[];
  /** Active suppliers — filtered by the section to those not yet offering this part. */
  suppliers: SupplierOption[];
  currencies: CurrencyOption[];
};

export function OfferingsSection({ partId, rows, suppliers, currencies }: Props) {
  const t = useTranslations("partDetail");
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [error, setError] = useState<string | null>(null);

  const offeredSupplierIds = new Set(rows.map((r) => r.supplierId));
  const availableSuppliers = suppliers.filter((s) => !offeredSupplierIds.has(s.id));

  const dialogInitial: OfferingValues =
    dialog.kind === "edit"
      ? {
          supplierSku: dialog.offering.supplierSku ?? "",
          defaultPurchasePrice:
            dialog.offering.defaultPurchasePrice != null
              ? String(dialog.offering.defaultPurchasePrice)
              : "",
          defaultPurchaseCurrency:
            dialog.offering.defaultPurchaseCurrency ?? "",
          minimumOrderQuantity:
            dialog.offering.minimumOrderQuantity != null
              ? String(dialog.offering.minimumOrderQuantity)
              : "",
          leadTimeDays:
            dialog.offering.leadTimeDays != null
              ? String(dialog.offering.leadTimeDays)
              : "",
          isPreferred: dialog.offering.isPreferred,
          notes: dialog.offering.notes ?? "",
        }
      : EMPTY_OFFERING_VALUES;

  const dialogSupplierId =
    dialog.kind === "edit" ? dialog.offering.supplierId : "";

  return (
    <Section
      title={t("offeringsTitle")}
      description={t("offeringsDescription")}
      hue="buy"
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDialog({ kind: "add" })}
          disabled={availableSuppliers.length === 0 && rows.length > 0}
          title={
            availableSuppliers.length === 0 && rows.length > 0
              ? t("allSuppliersHaveOffering")
              : undefined
          }
        >
          <Plus aria-hidden /> {t("addOffering")}
        </Button>
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyRow>{t("noOfferings")}</EmptyRow>
      ) : (
        <div className="bg-surface overflow-hidden rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32px]" />
                <TableHead>{t("thSupplier")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t("thSupplierSku")}
                </TableHead>
                <TableHead className="text-right">
                  {t("thSupplierPrice")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("thMoq")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("thLeadTime")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("thNotes")}
                </TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <OfferingTableRow
                  key={row.id}
                  partId={partId}
                  row={row}
                  onEdit={() => setDialog({ kind: "edit", offering: row })}
                  onError={setError}
                  onAfterAction={() => router.refresh()}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OfferingDialog
        // Re-key so the dialog state resets cleanly between Add and each Edit click.
        key={
          dialog.kind === "edit"
            ? `edit-${dialog.offering.id}`
            : dialog.kind === "add"
              ? "add"
              : "closed"
        }
        open={dialog.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: "closed" });
        }}
        partId={partId}
        offeringId={dialog.kind === "edit" ? dialog.offering.id : null}
        supplierId={dialogSupplierId}
        lockSupplier={dialog.kind === "edit"}
        suppliers={
          dialog.kind === "edit"
            ? suppliers
            : availableSuppliers
        }
        currencies={currencies}
        initial={dialogInitial}
      />
    </Section>
  );
}

function OfferingTableRow({
  partId,
  row,
  onEdit,
  onError,
  onAfterAction,
}: {
  partId: string;
  row: OfferingRow;
  onEdit: () => void;
  onError: (msg: string | null) => void;
  onAfterAction: () => void;
}) {
  const t = useTranslations("partDetail");
  const tCommon = useTranslations("common");
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function runSetPreferred() {
    onError(null);
    start(async () => {
      const r = await setPreferredOffering(partId, row.id);
      if (!r.ok) onError(r.error);
      else onAfterAction();
    });
  }

  function runDelete() {
    onError(null);
    start(async () => {
      const r = await deleteOffering(partId, row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmDelete(false);
      } else {
        onAfterAction();
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        {row.isPreferred ? (
          <Star
            aria-label={t("preferredAria")}
            className="fill-buy text-buy size-4"
          />
        ) : null}
      </TableCell>
      <TableCell className="min-w-0 font-medium whitespace-normal break-words">
        {row.supplierName}
      </TableCell>
      <TableCell className="hidden font-mono text-xs sm:table-cell">
        {row.supplierSku ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.defaultPurchaseCurrency &&
        row.defaultPurchaseCurrency.toUpperCase() !== "DKK" ? (
          // Foreign-currency display: composite string with an
          // approximate-DKK suffix — keep formatPriceWithDkk for the
          // dual-currency rendering since the dim-øre treatment doesn't
          // carry through "X.XX EUR (~Y.YY DKK)".
          formatPriceWithDkk(
            row.defaultPurchasePrice,
            row.defaultPurchaseCurrency,
            row.fxRateToDkk,
          )
        ) : (
          <Money
            amount={row.defaultPurchasePrice}
            currency={row.defaultPurchaseCurrency ?? "DKK"}
            fractionDigits={4}
            bold={false}
          />
        )}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {row.minimumOrderQuantity ?? (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {row.leadTimeDays != null ? (
          t("daysShort", { count: row.leadTimeDays })
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground hidden max-w-[280px] truncate text-xs lg:table-cell">
        {row.notes ?? (
          <Badge variant="ghost" className="px-1 py-0 font-normal">
            —
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("rowActionsAria", { name: row.supplierName })}
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
              disabled={row.isPreferred || pending}
              onSelect={(e) => {
                e.preventDefault();
                runSetPreferred();
              }}
            >
              <Star aria-hidden /> {t("setPreferred")}
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
              {confirmDelete ? tCommon("confirmRepeat") : t("remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
