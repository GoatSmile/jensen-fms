"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColorChip } from "@/components/color-swatch";
import { BIKE_STATUS_VARIANT, type BikeStatus } from "@/lib/bikes/status";

import { removeBikeFromPaintOrder } from "../_actions/remove-bike-from-paint";
import {
  AddBikeToPaintDialog,
  type EligibleBikeOption,
} from "./add-bike-to-paint-dialog";
import { Section } from "./section";

export type PaintOrderBikeRow = {
  bikeId: string;
  frameNumber: string;
  status: BikeStatus;
  templateLabel: string | null;
  addedAt: string;
  notes: string | null;
  /** LEGACY per-line colour/scope from the pre-items paint model (migration
   * 51) — read-only history on old orders; new orders carry colour on the
   * item lines. Null on anything created after the service remodel. */
  legacyColorName: string | null;
  legacyColorHex: string | null;
  legacyScopeLabel: string | null;
};

type Props = {
  serviceOrderId: string;
  orderStatus: string;
  rows: PaintOrderBikeRow[];
  eligibleBikes: EligibleBikeOption[];
};

export function PaintOrderBikesSection({
  serviceOrderId,
  orderStatus,
  rows,
  eligibleBikes,
}: Props) {
  const t = useTranslations("paintOrderDetail");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const canEdit = orderStatus === "planned";
  const canAdd = orderStatus !== "received_back" && orderStatus !== "cancelled";
  const hasLegacyColumns = rows.some(
    (r) => r.legacyColorName || r.legacyScopeLabel,
  );

  return (
    <Section
      title={t("bikesTitle")}
      description={
        canEdit
          ? t("bikesDescEdit")
          : t("bikesAttached", { count: rows.length })
      }
      action={
        <AddBikeToPaintDialog
          serviceOrderId={serviceOrderId}
          bikes={eligibleBikes}
          disabled={!canAdd}
          disabledReason={!canAdd ? t("orderClosed") : undefined}
        />
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
          {t("noBikes")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thFrameNumber")}</TableHead>
                <TableHead>{t("thTemplate")}</TableHead>
                {hasLegacyColumns ? (
                  <TableHead className="hidden sm:table-cell">
                    {t("thLegacy")}
                  </TableHead>
                ) : null}
                <TableHead className="hidden md:table-cell">
                  {t("thBikeStatus")}
                </TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <BikeRow
                  key={r.bikeId}
                  serviceOrderId={serviceOrderId}
                  row={r}
                  showLegacy={hasLegacyColumns}
                  canEdit={canEdit}
                  onError={setError}
                  onChange={() => router.refresh()}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function BikeRow({
  serviceOrderId,
  row,
  showLegacy,
  canEdit,
  onError,
  onChange,
}: {
  serviceOrderId: string;
  row: PaintOrderBikeRow;
  showLegacy: boolean;
  canEdit: boolean;
  onError: (msg: string | null) => void;
  onChange: () => void;
}) {
  const t = useTranslations("paintOrderDetail");
  const tBikeStatus = useTranslations("bikeStatus");
  const [pending, start] = useTransition();

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removeBikeFromPaintOrder(serviceOrderId, row.bikeId);
      if (!r.ok) onError(r.error);
      else onChange();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link href={`/bikes/${row.bikeId}`} className="hover:underline">
          {row.frameNumber}
        </Link>
      </TableCell>

      <TableCell className="text-sm">
        {row.templateLabel ?? <span className="text-muted-foreground">—</span>}
        {row.notes ? (
          <span className="text-muted-foreground block text-xs">
            {row.notes}
          </span>
        ) : null}
      </TableCell>

      {showLegacy ? (
        <TableCell className="hidden sm:table-cell">
          <span className="flex flex-col gap-0.5">
            {row.legacyColorName ? (
              <ColorChip hex={row.legacyColorHex} label={row.legacyColorName} />
            ) : null}
            {row.legacyScopeLabel ? (
              <span className="text-muted-foreground text-xs">
                {row.legacyScopeLabel}
              </span>
            ) : null}
            {!row.legacyColorName && !row.legacyScopeLabel ? (
              <span className="text-muted-foreground">—</span>
            ) : null}
          </span>
        </TableCell>
      ) : null}

      <TableCell className="hidden md:table-cell">
        <Badge variant={BIKE_STATUS_VARIANT[row.status] ?? "outline"}>
          {tBikeStatus.has(row.status) ? tBikeStatus(row.status) : row.status}
        </Badge>
      </TableCell>

      <TableCell className="text-right">
        {canEdit ? (
          <Button
            size="xs"
            variant="outline"
            onClick={runRemove}
            disabled={pending}
            aria-label={t("removeBikeAria")}
          >
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
