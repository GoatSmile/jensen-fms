"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckSquare, Wrench } from "lucide-react";

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

import { bulkMarkBikesBuilt } from "../_actions/bulk-mark-built";
import { AddBikeDialog } from "./add-bike-dialog";
import { BulkAddDialog } from "./bulk-add-dialog";
import { Section } from "./section";

export type MOBikeRow = {
  id: string;
  frameNumber: string;
  status: BikeStatus;
  identifierCount: number;
  requiredIdentifierCount: number;
  /** Customer this bike is slated/assigned to. Null until someone earmarks it. */
  ownerName: string | null;
  ownerUnitName: string | null;
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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const slotsRemaining = targetQuantity - rows.length;
  const canAdd = !closed && slotsRemaining > 0;
  const unbuiltCount = rows.filter(
    (r) =>
      r.status === "planning" || r.status === "building",
  ).length;
  const canBulkBuild = !closed && unbuiltCount >= 2;

  function runBulkBuild() {
    setError(null);
    startBulk(async () => {
      const r = await bulkMarkBikesBuilt(moId);
      if (!r.ok) {
        setError(r.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Section
      title="Bikes"
      description={`${completedQuantity} built · ${targetQuantity} target · ${slotsRemaining} slot${slotsRemaining === 1 ? "" : "s"} remaining`}
      action={
        <div className="flex gap-2">
          {canBulkBuild ? (
            <Button
              size="sm"
              variant="outline"
              onClick={runBulkBuild}
              disabled={bulkPending}
            >
              <CheckSquare aria-hidden /> Mark {unbuiltCount} built
            </Button>
          ) : null}
          <BulkAddDialog
            moId={moId}
            slotsRemaining={slotsRemaining}
            disabled={!canAdd}
            disabledReason={
              closed
                ? "MO is closed."
                : slotsRemaining <= 0
                  ? "All target slots are filled."
                  : undefined
            }
          />
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
        </div>
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
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Frame number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">
                  Slated for
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Identifiers
                </TableHead>
                <TableHead className="w-[100px] text-right sm:w-[120px]" />
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
}: {
  moId: string;
  row: MOBikeRow;
  closed: boolean;
  onError: (msg: string | null) => void;
}) {
  const isBuilt =
    row.status === "in_stock" ||
    row.status === "assigned" ||
    row.status === "in_service";
  const isTerminal =
    row.status === "retired" || row.status === "lost_or_stolen";

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
      <TableCell className="hidden text-xs md:table-cell">
        {row.ownerName ? (
          <span>
            {row.ownerName}
            {row.ownerUnitName ? (
              <span className="text-muted-foreground">
                {" · "}
                {row.ownerUnitName}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground italic">—</span>
        )}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums text-xs sm:table-cell">
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
          <Button size="xs" variant="outline" asChild>
            <Link
              href={`/manufacturing-orders/${moId}/bikes/${row.id}/build`}
            >
              <Wrench aria-hidden /> Build
            </Link>
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
