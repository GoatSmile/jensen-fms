"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColorChip, ColorSwatch } from "@/components/color-swatch";
import type { ColorOption } from "@/app/paint-orders/_components/paint-order-form";
import {
  BIKE_STATUS_VARIANT,
  bikeStatusLabel,
  type BikeStatus,
} from "@/lib/bikes/status";
import { PAINT_SCOPES, paintScopeLabel, paintScopeParts } from "@/lib/paint/scope";

import { removeBikeFromPaintOrder } from "../_actions/remove-bike-from-paint";
import { updatePaintLine } from "../_actions/update-paint-line";
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
  colorId: string | null;
  colorName: string | null;
  colorHex: string | null;
  colorFinish: string | null;
  scope: string | null;
  /** Resolved JP-lak service SKU + formatted per-bike price (auto-derived). */
  lakSku: string | null;
  lakPriceLabel: string | null;
};

type Props = {
  paintOrderId: string;
  paintOrderStatus: string;
  rows: PaintOrderBikeRow[];
  eligibleBikes: EligibleBikeOption[];
  colors: ColorOption[];
  defaultColorId: string | null;
  /** Σ of auto-derived per-line prices, formatted; null when none priced. */
  orderTotalLabel: string | null;
};

export function PaintOrderBikesSection({
  paintOrderId,
  paintOrderStatus,
  rows,
  eligibleBikes,
  colors,
  defaultColorId,
  orderTotalLabel,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const canEdit = paintOrderStatus === "planned";
  const canAdd =
    paintOrderStatus !== "received_back" && paintOrderStatus !== "cancelled";

  return (
    <Section
      title="Bikes in this batch"
      description={
        canEdit
          ? "Add frames, then set each one's colour and what gets painted. Editable until the order is sent."
          : `${rows.length} ${rows.length === 1 ? "bike" : "bikes"} attached.`
      }
      action={
        <AddBikeToPaintDialog
          paintOrderId={paintOrderId}
          bikes={eligibleBikes}
          colors={colors}
          defaultColorId={defaultColorId}
          disabled={!canAdd}
          disabledReason={!canAdd ? "Paint order is closed." : undefined}
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
          No bikes attached yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Frame number</TableHead>
                <TableHead>Colour</TableHead>
                <TableHead>Paints</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Service / bike
                </TableHead>
                <TableHead className="hidden md:table-cell">Bike status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <BikeRow
                  key={r.bikeId}
                  paintOrderId={paintOrderId}
                  row={r}
                  colors={colors}
                  canEdit={canEdit}
                  onError={setError}
                  onChange={() => router.refresh()}
                />
              ))}
            </TableBody>
          </Table>
          {orderTotalLabel ? (
            <div className="text-muted-foreground flex justify-end gap-2 border-t px-4 py-2 text-sm">
              <span>Auto paint cost (JP-lak):</span>
              <span className="text-foreground tabular-nums">
                {orderTotalLabel}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}

function BikeRow({
  paintOrderId,
  row,
  colors,
  canEdit,
  onError,
  onChange,
}: {
  paintOrderId: string;
  row: PaintOrderBikeRow;
  colors: ColorOption[];
  canEdit: boolean;
  onError: (msg: string | null) => void;
  onChange: () => void;
}) {
  const [pending, start] = useTransition();

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removeBikeFromPaintOrder(paintOrderId, row.bikeId);
      if (!r.ok) onError(r.error);
      else onChange();
    });
  }

  function patch(p: { colorId?: string | null; scope?: string | null }) {
    onError(null);
    start(async () => {
      const r = await updatePaintLine(paintOrderId, row.bikeId, p);
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

      <TableCell>
        {canEdit ? (
          <Select
            value={row.colorId ?? ""}
            onValueChange={(v) => patch({ colorId: v })}
            disabled={pending}
          >
            <SelectTrigger size="sm" className="w-[150px]">
              <SelectValue placeholder="Batch default" />
            </SelectTrigger>
            <SelectContent>
              {colors.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <ColorSwatch hex={c.hex} label={c.name_en} />
                  {c.name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : row.colorName ? (
          <span className="flex flex-col gap-0.5">
            <ColorChip hex={row.colorHex} label={row.colorName} />
            {row.colorFinish ? (
              <span className="text-muted-foreground text-xs">
                {row.colorFinish}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell>
        {canEdit ? (
          <Select
            value={row.scope ?? ""}
            onValueChange={(v) => patch({ scope: v })}
            disabled={pending}
          >
            <SelectTrigger size="sm" className="w-[130px]">
              <SelectValue placeholder="Set…" />
            </SelectTrigger>
            <SelectContent>
              {PAINT_SCOPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {paintScopeLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : paintScopeLabel(row.scope) ? (
          <span
            className="text-sm"
            title={paintScopeParts(row.scope) ?? undefined}
          >
            {paintScopeLabel(row.scope)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
        {row.lakPriceLabel ? (
          <span title={row.lakSku ?? undefined}>{row.lakPriceLabel}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <Badge variant={BIKE_STATUS_VARIANT[row.status] ?? "outline"}>
          {bikeStatusLabel(row.status)}
        </Badge>
      </TableCell>

      <TableCell className="text-right">
        {canEdit ? (
          <Button
            size="xs"
            variant="outline"
            onClick={runRemove}
            disabled={pending}
            aria-label="Remove bike from paint order"
          >
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
