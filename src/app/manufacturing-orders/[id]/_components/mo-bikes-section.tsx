"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckSquare, Layers, Printer, Wrench } from "lucide-react";

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
import { BIKE_STATUS_VARIANT, type BikeStatus } from "@/lib/bikes/status";

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
  /** Whether the frame is physically at the painter (Tier 2 Phase C). */
  atPainter: boolean;
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
  const t = useTranslations("moDetail");
  const tBikeStatus = useTranslations("bikeStatus");
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

  // Only frame-confirmed unbuilt bikes that aren't at the painter can be
  // bulk-built; the rest are skipped with their reason. At-painter wins over
  // unconfirmed so a bike is counted under one reason only.
  const { buildableCount, unconfirmedCount, atPainterCount } = useMemo(() => {
    let buildable = 0;
    let unconfirmed = 0;
    let atPainter = 0;
    for (const r of rows) {
      if (r.status !== "planning" && r.status !== "building") continue;
      if (r.atPainter) atPainter += 1;
      else if (r.frameConfirmed) buildable += 1;
      else unconfirmed += 1;
    }
    return {
      buildableCount: buildable,
      unconfirmedCount: unconfirmed,
      atPainterCount: atPainter,
    };
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
      setError(t("errCountPositive"));
      return;
    }
    startBulk(async () => {
      const r = await bulkMarkBikesBuilt(moId, n);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const skipReasons: string[] = [];
      if (r.skippedUnconfirmed > 0) {
        skipReasons.push(
          t("skipNeedConfirmedFrame", { count: r.skippedUnconfirmed }),
        );
      }
      if (r.skippedAtPainter > 0) {
        skipReasons.push(t("skipAtPainter", { count: r.skippedAtPainter }));
      }
      const skippedNote =
        skipReasons.length > 0
          ? t("skippedNote", { reasons: skipReasons.join(", ") })
          : "";
      setNotice(t("markedBuilt", { count: r.built }) + skippedNote);
      setBuildCount("");
      router.refresh();
    });
  }

  return (
    <Section
      title={t("bikesTitle")}
      description={t("bikesDesc", {
        built: completedQuantity,
        target: targetQuantity,
        slots: slotsRemaining,
      })}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {!closed && unconfirmedCount + buildableCount + atPainterCount > 0 ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                href={`/manufacturing-orders/${moId}/pick-list/print`}
                target="_blank"
              >
                <Printer aria-hidden /> {t("pickListBtn")}
              </Link>
            </Button>
          ) : null}
          {!closed && unconfirmedCount + buildableCount > 0 ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/manufacturing-orders/${moId}/build-batch`}>
                <Layers aria-hidden /> {t("bulkBuildBtn")}
              </Link>
            </Button>
          ) : null}
          {canBulkBuild ? (
            <div className="flex items-center gap-1">
              <Input
                inputMode="numeric"
                value={buildCount}
                onChange={(e) => setBuildCount(e.target.value)}
                placeholder={String(buildableCount)}
                className="h-8 w-14 text-center text-xs tabular-nums"
                aria-label={t("howManyBuiltAria")}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={runBulkBuild}
                disabled={bulkPending}
              >
                <CheckSquare aria-hidden />
                {bulkPending
                  ? t("building")
                  : buildCount.trim() === ""
                    ? t("markNBuilt", { count: buildableCount })
                    : t("markNextBuilt")}
              </Button>
            </div>
          ) : null}
          <BulkAddDialog
            moId={moId}
            slotsRemaining={slotsRemaining}
            disabled={!canAdd}
            disabledReason={
              closed
                ? t("moClosedReason")
                : slotsRemaining <= 0
                  ? t("slotsFilledReason")
                  : undefined
            }
          />
          <AddBikeDialog
            moId={moId}
            suggestedFrameNumber={suggestedFrameNumber}
            disabled={!canAdd}
            disabledReason={
              closed
                ? t("moClosedReason")
                : slotsRemaining <= 0
                  ? t("slotsFilledIncreaseReason")
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
          {t("unconfirmedNote", { count: unconfirmedCount })}
        </p>
      ) : null}
      {!closed && atPainterCount > 0 ? (
        <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
          {t("atPainterNote", { count: atPainterCount })}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
          {t("noBikesYet")}
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
                    `${countByStatus.get(s.status)} ${tBikeStatus.has(s.status) ? tBikeStatus(s.status) : s.status}`,
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
                label={t("filterAll", { count: rows.length })}
                active={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              />
              {STATUS_ORDER.map(({ status }) => {
                const count = countByStatus.get(status) ?? 0;
                if (count === 0) return null;
                return (
                  <FilterChip
                    key={status}
                    label={`${tBikeStatus.has(status) ? tBikeStatus(status) : status} ${count}`}
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
                  <TableHead>{t("thFrameNumber")}</TableHead>
                  <TableHead>{t("thStatus")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("thSlatedFor")}
                  </TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    {t("thIdentifiers")}
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
              {t("showAllBikes", { count: filtered.length })}
            </Button>
          ) : null}
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm italic">
              {t("noBikesMatchFilter")}
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
  const t = useTranslations("moDetail");
  const tBikeStatus = useTranslations("bikeStatus");
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
            title={t("provisionalTitle")}
          >
            {t("provisional")}
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={BIKE_STATUS_VARIANT[row.status] ?? "outline"}>
            {tBikeStatus.has(row.status) ? tBikeStatus(row.status) : row.status}
          </Badge>
          {row.atPainter ? (
            <Badge variant="warning">{t("atPainterBadge")}</Badge>
          ) : null}
        </div>
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
            ? t("identifiersRequiredSuffix", {
                count: row.requiredIdentifierCount,
              })
            : ""}
        </span>
      </TableCell>
      <TableCell className="text-right">
        {!closed && !isBuilt && !isTerminal ? (
          <Button size="xs" variant="outline" asChild>
            <Link
              href={`/manufacturing-orders/${moId}/bikes/${row.id}/build`}
            >
              <Wrench aria-hidden />{" "}
              {needsFrame ? t("confirmAndBuild") : t("build")}
            </Link>
          </Button>
        ) : (
          <Link
            href={`/bikes/${row.id}`}
            className="text-xs hover:underline"
          >
            {t("open")}
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
}
