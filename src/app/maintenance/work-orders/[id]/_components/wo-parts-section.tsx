"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import { formatDate } from "@/lib/parts/format";

import { removePartFromWO } from "../_actions/manage-wo-parts";
import { Section } from "./section";
import { WOPartDialog, type PartChoice } from "./wo-part-dialog";

export type WOPartRow = {
  id: string;
  partId: string;
  partSku: string;
  partName: string;
  quantity: number;
  unitPrice: number | null;
  installedAt: string;
};

type Props = {
  woId: string;
  rows: WOPartRow[];
  readOnly: boolean;
  partsCatalog: PartChoice[];
  retailByPartId: Map<string, number>;
};

export function WOPartsSection({
  woId,
  rows,
  readOnly,
  partsCatalog,
  retailByPartId,
}: Props) {
  const t = useTranslations("workOrders");
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const onWOPartIds = new Set(rows.map((r) => r.partId));

  return (
    <Section
      title={t("partsTitle")}
      description={readOnly ? t("partsReadOnlyDesc") : t("partsDesc")}
      action={
        readOnly ? null : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
          >
            <Plus aria-hidden /> {t("addPart")}
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
        <div className="text-ink-3 bg-ground flex h-20 items-center justify-center rounded-lg text-sm">
          {t("noParts")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("thPart")}</TableHead>
              <TableHead className="text-right">{t("thQty")}</TableHead>
              {/* On phones, the Total column is most useful; hide the
                  per-unit price and installed-at date. */}
              <TableHead className="hidden text-right sm:table-cell">
                {t("thUnitPrice")}
              </TableHead>
              <TableHead className="text-right">{t("thTotal")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("thInstalled")}
              </TableHead>
              {readOnly ? null : <TableHead className="w-[40px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const total =
                row.unitPrice != null ? row.quantity * row.unitPrice : null;
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
                    {row.quantity}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    <Money
                      amount={row.unitPrice}
                      currency="DKK"
                      bold={false}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Money amount={total} currency="DKK" bold={false} />
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {formatDate(row.installedAt)}
                  </TableCell>
                  {readOnly ? null : (
                    <TableCell className="text-right">
                      <RemoveButton
                        woId={woId}
                        rowId={row.id}
                        onError={setError}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {dialogOpen ? (
        <WOPartDialog
          open
          onOpenChange={setDialogOpen}
          woId={woId}
          parts={partsCatalog}
          excludeIds={onWOPartIds}
          retailByPartId={retailByPartId}
        />
      ) : null}
    </Section>
  );
}

function RemoveButton({
  woId,
  rowId,
  onError,
}: {
  woId: string;
  rowId: string;
  onError: (msg: string | null) => void;
}) {
  const t = useTranslations("workOrders");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removePartFromWO(woId, rowId);
      if (!r.ok) {
        onError(r.error);
        setConfirm(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      disabled={pending}
      aria-label={confirm ? t("confirmRemove") : t("removePart")}
      title={confirm ? t("removeConfirmTitle") : t("removeTitle")}
      onClick={() => {
        if (confirm) runRemove();
        else setConfirm(true);
      }}
    >
      <Trash2 aria-hidden className={confirm ? "text-destructive" : undefined} />
    </Button>
  );
}
