"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ShoppingCart, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatQuantity } from "@/lib/parts/stock";

import {
  draftPOsFromReorderPoints,
  type ReorderDraftResult,
  type ReorderRow,
} from "../_actions/draft-po-from-reorder";

type Props = {
  rows: ReorderRow[];
};

/**
 * "Below reorder point" banner at the top of the parts list — the
 * proactive sibling of the MO shortfall card. One click drafts per-supplier
 * POs for everything that's low (quantities from reorder_quantity, MOQ
 * respected). Renders nothing when stock is healthy; the server page skips
 * it entirely when no part has a reorder point set.
 */
export function ReorderBanner({ rows }: Props) {
  const t = useTranslations("parts");
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<ReorderDraftResult | null>(null);
  const [isPending, start] = useTransition();

  if (rows.length === 0) return null;

  function onDraft() {
    setResult(null);
    start(async () => {
      const r = await draftPOsFromReorderPoints();
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left text-sm font-medium text-amber-900 dark:text-amber-200"
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          )}
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {t("reorderCount", { count: rows.length })}
        </button>
        <Button type="button" size="sm" onClick={onDraft} disabled={isPending}>
          <ShoppingCart className="size-4" aria-hidden />
          {isPending ? t("drafting") : t("draftPos")}
        </Button>
      </div>

      {result ? (
        result.ok ? (
          <div
            className="border-t border-amber-200 px-4 py-2.5 text-sm text-emerald-800 dark:border-amber-900 dark:text-emerald-300"
            role="status"
          >
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
                {t("draftedLineMeta", {
                  supplier: po.supplierName,
                  count: po.lines,
                })}
              </span>
            ))}
            {t("draftedSuffix")}
            {result.skipped.length > 0 ? (
              <span className="text-muted-foreground block text-xs">
                {t("skippedPrefix")}
                {result.skipped.map((s) => `${s.sku} (${s.reason})`).join(", ")}
              </span>
            ) : null}
          </div>
        ) : (
          <p
            className="text-destructive border-t border-amber-200 px-4 py-2.5 text-sm dark:border-amber-900"
            role="alert"
          >
            {result.error}
          </p>
        )
      ) : null}

      {expanded ? (
        <ul className="divide-y divide-amber-200/70 border-t border-amber-200 dark:divide-amber-900/50 dark:border-amber-900">
          {rows.map((r) => (
            <li
              key={r.partId}
              className="flex items-center justify-between gap-3 px-4 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <Link
                  href={`/parts/${r.partId}`}
                  className="truncate text-sm hover:underline"
                >
                  {r.name}
                </Link>
                <span className="text-muted-foreground font-mono text-[10px]">
                  {r.sku}
                </span>
              </div>
              <span className="shrink-0 text-xs tabular-nums">
                <span className="text-destructive font-medium">
                  {formatQuantity(r.onHand)}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  {t("pointOrder", {
                    point: formatQuantity(r.reorderPoint),
                    qty: formatQuantity(r.orderQty),
                  })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
