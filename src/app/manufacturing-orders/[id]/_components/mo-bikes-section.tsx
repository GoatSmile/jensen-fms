"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";

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

import { markBikeBuilt } from "../_actions/mark-bike-built";
import { AddBikeDialog } from "./add-bike-dialog";
import { Section } from "./section";

export type MOBikeRow = {
  id: string;
  frameNumber: string;
  status: BikeStatus;
  identifierCount: number;
  requiredIdentifierCount: number;
};

type Props = {
  moId: string;
  rows: MOBikeRow[];
  targetQuantity: number;
  completedQuantity: number;
  suggestedFrameNumber: string;
  closed: boolean;
};

export function MOBikesSection({
  moId,
  rows,
  targetQuantity,
  completedQuantity,
  suggestedFrameNumber,
  closed,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const slotsRemaining = targetQuantity - rows.length;
  const canAdd = !closed && slotsRemaining > 0;

  return (
    <Section
      title="Bikes"
      description={`${completedQuantity} built · ${targetQuantity} target · ${slotsRemaining} slot${slotsRemaining === 1 ? "" : "s"} remaining`}
      action={
        <AddBikeDialog
          moId={moId}
          suggestedFrameNumber={suggestedFrameNumber}
          disabled={!canAdd}
          disabledReason={
            closed
              ? "MO is closed."
              : slotsRemaining <= 0
                ? "All target slots are filled. Increase target_quantity to add more."
                : undefined
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
          No bikes yet. Add the first one to start the build.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Frame number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Identifiers</TableHead>
                <TableHead className="w-[120px] text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <BikeRow
                  key={row.id}
                  moId={moId}
                  row={row}
                  closed={closed}
                  onError={setError}
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
  moId,
  row,
  closed,
  onError,
}: {
  moId: string;
  row: MOBikeRow;
  closed: boolean;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const isBuilt =
    row.status === "in_stock" ||
    row.status === "assigned" ||
    row.status === "in_service";
  const isTerminal =
    row.status === "retired" || row.status === "lost_or_stolen";

  function runMarkBuilt() {
    onError(null);
    start(async () => {
      const r = await markBikeBuilt(moId, row.id);
      if (!r.ok) onError(r.error);
      else router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link href={`/bikes/${row.id}`} className="hover:underline">
          {row.frameNumber}
        </Link>
      </TableCell>
      <TableCell>
        <Badge
          variant={BIKE_STATUS_VARIANT[row.status] ?? "outline"}
        >
          {bikeStatusLabel(row.status)}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs">
        <span
          className={
            row.requiredIdentifierCount > 0 &&
            row.identifierCount < row.requiredIdentifierCount
              ? "text-amber-700 dark:text-amber-300"
              : "text-muted-foreground"
          }
        >
          {row.identifierCount}
          {row.requiredIdentifierCount > 0
            ? ` / ${row.requiredIdentifierCount} required`
            : ""}
        </span>
      </TableCell>
      <TableCell className="text-right">
        {!closed && !isBuilt && !isTerminal ? (
          <Button
            size="xs"
            variant="outline"
            onClick={runMarkBuilt}
            disabled={pending}
          >
            <CheckCircle2 aria-hidden /> Mark built
          </Button>
        ) : (
          <Link
            href={`/bikes/${row.id}`}
            className="text-xs hover:underline"
          >
            Open →
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
}
