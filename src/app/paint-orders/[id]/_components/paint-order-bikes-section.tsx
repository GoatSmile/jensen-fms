"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import {
  BIKE_STATUS_VARIANT,
  bikeStatusLabel,
  type BikeStatus,
} from "@/lib/bikes/status";

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
};

type Props = {
  paintOrderId: string;
  paintOrderStatus: string;
  rows: PaintOrderBikeRow[];
  eligibleBikes: EligibleBikeOption[];
};

export function PaintOrderBikesSection({
  paintOrderId,
  paintOrderStatus,
  rows,
  eligibleBikes,
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
          ? "Add the bikes that will ship with this paint order. Bikes can be removed until the order is sent."
          : `${rows.length} ${rows.length === 1 ? "bike" : "bikes"} attached.`
      }
      action={
        <AddBikeToPaintDialog
          paintOrderId={paintOrderId}
          bikes={eligibleBikes}
          disabled={!canAdd}
          disabledReason={
            !canAdd ? "Paint order is closed." : undefined
          }
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
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Frame number</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Bike status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <BikeRow
                  key={r.bikeId}
                  paintOrderId={paintOrderId}
                  row={r}
                  canRemove={canEdit}
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
  paintOrderId,
  row,
  canRemove,
  onError,
  onChange,
}: {
  paintOrderId: string;
  row: PaintOrderBikeRow;
  canRemove: boolean;
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

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link href={`/bikes/${row.bikeId}`} className="hover:underline">
          {row.frameNumber}
        </Link>
      </TableCell>
      <TableCell className="text-sm">
        {row.templateLabel ?? (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={BIKE_STATUS_VARIANT[row.status] ?? "outline"}>
          {bikeStatusLabel(row.status)}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {row.notes ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        {canRemove ? (
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
