"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CheckSquare, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  /** Whether the real frame number has been confirmed (gates build). */
  frameConfirmed: boolean;
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

/** Display order + strip colours for the per-status progress segments. */
const STATUS_ORDER: { status: BikeStatus; barClass: string }[] = [
  { status: "planning", barClass: "bg-slate-300 dark:bg-slate-600" },
  { status: "building", barClass: "bg-amber-400" },
  { status: "in_stock", barClass: "bg-emerald-500" },
  { status: "assigned", barClass: "bg-blue-500" },
  { status: "in_service", barClass: "bg-emerald-700" },
  { status: "in_maintenance", barClass: "bg-amber-600" },
  { status: "retired", barClass: "bg-slate-400" },
  { status: "lost_or_stolen", barClass: "bg-red-500" },
];

/** Rows rendered before the "Show all" expander kicks in. */
const COLLAPSED_ROW_LIMIT = 30;

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
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BikeStatus | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const [buildCount, setBuildCount] = useState("");
  const [bulkPending, startBulk] = useTransition();

  const slotsRemaining = targetQuantity - rows.length;
  const canAdd = !closed && slotsRemaining > 0;

  const countByStatus = useMemo(() => {
    const m = new Map<BikeStatus, number>();
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rows]);

  // Only frame-confirmed unbuilt bikes can be bulk-built; the rest must have
  // their real frame confirmed in the build workbench first.
  const { buildableCount, unconfirmedCount } = useMemo(() => {
    let buildable = 0;
    let unconfirmed = 0;
    for (const r of rows) {
      if (r.status !== "planning" && r.status !== "building") continue;
      if (r.frameConfirmed) buildable += 1;
      else unconfirmed += 1;
    }
    return { buildableCount: buildable, unconfirmedCount: unconfirmed };
  }, [rows]);
  const canBulkBuild = !closed && buildableCount > 0;

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? rows
        : rows.filter((r) => r.status === statusFilter),
    [rows, statusFilter],
  );
  const visible = showAll ? filtered : filtered.slice(0, COLLAPSED_ROW_LIMIT);

  function runBulkBuild() {
    setError(null);
    setNotice(null);
    const n = buildCount.trim() === "" ? undefined : Number(buildCount);
    if (
      n !== undefined &&
      (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0)
    ) {
      setError("Count must be a positive whole number.");
      return;
    }
    startBulk(async () => {
      const r = await bulkMarkBikesBuilt(moId, n);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const skippedNote =
        r.skipped > 0
          ? ` ${r.skipped} skipped — confirm their frame number in the build workbench.`
          : "";
      setNotice(
        `Marked ${r.built} bike${r.built === 1 ? "" : "s"} built.${skippedNote}`,
      );
      setBuildCount("");
      router.refresh();
    });
  }

  return (
    <Section
      title="Bikes"
      description={`${completedQuantity} built · ${targetQuantity} target · ${slotsRemaining} slot${slotsRemaining === 1 ? "" : "s"} remaining`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {canBulkBuild ? (
            <div className="flex items-center gap-1">
              <Input
                inputMode="numeric"
                value={buildCount}
                onChange={(e) => setBuildCount(e.target.value)}
                placeholder={String(buildableCount)}
                className="h-8 w-14 text-center text-xs tabular-nums"
                aria-label="How many bikes to mark built"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={runBulkBuild}
                disabled={bulkPending}
              >
                <CheckSquare aria-hidden />
                {bulkPending
                  ? "Building…"
                  : buildCount.trim() === ""
                    ? `Mark ${buildableCount} built`
                    : "Mark next built"}
              </Button>
            </div>
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
      {notice && !error ? (
        <p
          className="mb-3 text-sm text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {!closed && unconfirmedCount > 0 ? (
        <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
          {unconfirmedCount} bike{unconfirmedCount === 1 ? "" : "s"} need
          {unconfirmedCount === 1 ? "s" : ""} a confirmed frame number — open the
          build workbench to enter the real frame before building.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
          No bikes yet. Add the first one to start the build.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Progress strip + status filter chips. One glance answers
              "how far along is this batch" without scrolling 100 rows. */}
          <div className="flex flex-col gap-2">
            <div
              className="flex h-2 w-full overflow-hidden rounded-full"
              role="img"
              aria-label={STATUS_ORDER.filter(
                (s) => (countByStatus.get(s.status) ?? 0) > 0,
              )
                .map(
                  (s) =>
                    `${countByStatus.get(s.status)} ${bikeStatusLabel(s.status)}`,
                )
                .join(", ")}
            >
              {STATUS_ORDER.map(({ status, barClass }) => {
                const count = countByStatus.get(status) ?? 0;
                if (count === 0) return null;
                return (
                  <div
                    key={status}
                    className={barClass}
                    style={{ width: `${(count / rows.length) * 100}%` }}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                label={`All ${rows.length}`}
                active={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              />
              {STATUS_ORDER.map(({ status }) => {
                const count = countByStatus.get(status) ?? 0;
                if (count === 0) return null;
                return (
                  <FilterChip
                    key={status}
                    label={`${bikeStatusLabel(status)} ${count}`}
                    active={statusFilter === status}
                    onClick={() =>
                      setStatusFilter((prev) =>
                        prev === status ? "all" : status,
                      )
                    }
                  />
                );
              })}
            </div>
          </div>

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
                {visible.map((row) => (
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
          {filtered.length > visible.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAll(true)}
              className="self-center"
            >
              Show all {filtered.length} bikes
            </Button>
          ) : null}
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm italic">
              No bikes match the filter.
            </p>
          ) : null}
        </div>
      )}
    </Section>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-0.5 text-xs tabular-nums transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {label}
    </button>
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
  const isUnbuilt = row.status === "planning" || row.status === "building";
  const needsFrame = isUnbuilt && !row.frameConfirmed;

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link href={`/bikes/${row.id}`} className="hover:underline">
          {row.frameNumber}
        </Link>
        {needsFrame ? (
          <span
            className="ml-2 align-middle text-[10px] font-sans text-amber-700 dark:text-amber-300"
            title="Provisional frame — confirm the real one in the build workbench"
          >
            provisional
          </span>
        ) : null}
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
              <Wrench aria-hidden /> {needsFrame ? "Confirm & build" : "Build"}
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
