"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PackageSearch,
  ShoppingCart,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatQuantity } from "@/lib/parts/stock";
import type { CoverageRow } from "@/lib/manufacturing/coverage";

import {
  draftPOsFromShortfall,
  type DraftPOResult,
} from "../_actions/draft-po-from-shortfall";

type Props = {
  moId: string;
  remainingToBuild: number;
  rows: CoverageRow[];
  readOnly: boolean;
};

/**
 * "Can I build this?" — recipe × remaining bikes vs current stock.
 * Shortfall rows surface on top with a one-click escalation into draft
 * POs (one per supplier, from the parts' offerings). Covered rows stay
 * collapsed; at 50 recipe lines nobody scrolls a green wall.
 */
export function CoverageSection({
  moId,
  remainingToBuild,
  rows,
  readOnly,
}: Props) {
  const t = useTranslations("moDetail");
  const router = useRouter();
  const [showCovered, setShowCovered] = useState(false);
  const [result, setResult] = useState<DraftPOResult | null>(null);
  const [isPending, start] = useTransition();

  const shortfall = rows.filter((r) => r.shortfall > 0);
  const covered = rows.filter((r) => r.shortfall === 0);
  const allCovered = shortfall.length === 0;

  function onDraftPOs() {
    setResult(null);
    start(async () => {
      const r = await draftPOsFromShortfall(moId);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-md border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <PackageSearch className="text-muted-foreground size-4" aria-hidden />
          <h2 className="text-sm font-semibold">{t("coverageTitle")}</h2>
          {remainingToBuild === 0 ? (
            <Badge variant="outline">{t("nothingLeft")}</Badge>
          ) : allCovered ? (
            <Badge variant="success">
              {t("allCoveredFor", { count: remainingToBuild })}
            </Badge>
          ) : (
            <Badge variant="destructive">
              {t("partsShort", { count: shortfall.length })}
            </Badge>
          )}
        </div>
        {!readOnly && shortfall.length > 0 && remainingToBuild > 0 ? (
          <Button
            type="button"
            size="sm"
            onClick={onDraftPOs}
            disabled={isPending}
          >
            <ShoppingCart className="size-4" aria-hidden />
            {isPending
              ? t("drafting")
              : t("draftPoShortfall", { count: shortfall.length })}
          </Button>
        ) : null}
      </header>

      {result ? (
        result.ok ? (
          <div
            className="border-b bg-good-wash px-4 py-3 text-sm text-good"
            role="status"
          >
            <p>
              {t("draftedPrefix")}
              {result.pos.map((po, i) => (
                <span key={po.id}>
                  {i > 0 ? ", " : ""}
                  <Link
                    href={`/purchase-orders/${po.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {po.poNumber}
                  </Link>{" "}
                  {t("poLineSummary", {
                    supplier: po.supplierName,
                    count: po.lines,
                  })}
                </span>
              ))}
              {t("draftedSuffix")}
            </p>
            {result.skipped.length > 0 ? (
              <p className="mt-1 text-xs">
                {t("skippedPrefix")}
                {result.skipped
                  .map((s) => `${s.sku} (${s.reason})`)
                  .join(", ")}
              </p>
            ) : null}
          </div>
        ) : (
          <p
            className="text-destructive border-b px-4 py-3 text-sm"
            role="alert"
          >
            {result.error}
          </p>
        )
      ) : null}

      {remainingToBuild === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          {t("coverageNotApply")}
        </p>
      ) : (
        <div className="flex flex-col">
          {shortfall.length > 0 ? (
            <ul className="divide-y">
              {shortfall.map((r) => (
                <CoverageLine key={r.partId} row={r} short />
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 p-4 text-sm text-good">
              <CheckCircle2 className="size-4" aria-hidden />
              {t("stockCoversAll", { count: remainingToBuild })}
            </p>
          )}

          {covered.length > 0 ? (
            <div className="border-t">
              <button
                type="button"
                onClick={() => setShowCovered((v) => !v)}
                className="hover:bg-muted/30 flex w-full items-center gap-2 px-4 py-2 text-left text-xs"
              >
                {showCovered ? (
                  <ChevronDown className="size-3.5" aria-hidden />
                ) : (
                  <ChevronRight className="size-3.5" aria-hidden />
                )}
                <span className="text-muted-foreground">
                  {t("coveredParts", { count: covered.length })}
                </span>
              </button>
              {showCovered ? (
                <ul className="divide-y border-t">
                  {covered.map((r) => (
                    <CoverageLine key={r.partId} row={r} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CoverageLine({ row, short }: { row: CoverageRow; short?: boolean }) {
  const t = useTranslations("moDetail");
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{row.name}</span>
        <span className="text-muted-foreground font-mono text-[10px]">
          {t("perBikeLine", {
            sku: row.sku,
            qty: formatQuantity(row.perBike),
          })}
        </span>
      </div>
      <div className="shrink-0 text-right text-xs tabular-nums">
        <span className="text-muted-foreground">
          {t("needHave", {
            need: formatQuantity(row.demand),
            have: formatQuantity(row.onHand),
          })}
        </span>
        {short ? (
          <span className="text-destructive ml-2 font-semibold">
            {t("shortBy", { qty: formatQuantity(row.shortfall) })}
          </span>
        ) : (
          <span className="ml-2 text-good">
            {t("ok")}
          </span>
        )}
      </div>
    </li>
  );
}
