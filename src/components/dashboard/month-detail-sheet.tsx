"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { loadMonthDetailAction } from "@/app/_actions/month-detail";
import type {
  MonthDetail,
  MonthDetailKind,
} from "@/lib/dashboard/month-detail";

export type MonthSelection = {
  kind: MonthDetailKind;
  /** YYYY-MM-01, as delivered by the RPC. */
  monthStart: string;
  /** e.g. "Bikes sold — March 2026". */
  title: string;
  /** Optional pre-computed context, e.g. the invoiced split. */
  description?: string;
};

/**
 * Drill-down drawer behind the dashboard trend charts: click a bar, see the
 * records that make up its number. Data is fetched on open via a server
 * action; months covered by the Excel backfill explain themselves instead
 * of showing an empty list.
 */
export function MonthDetailSheet({
  selection,
  onClose,
}: {
  selection: MonthSelection | null;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.monthDetail");
  const [detail, setDetail] = useState<MonthDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selection) return;
    let stale = false;
    setDetail(null);
    setError(null);
    loadMonthDetailAction(selection.kind, selection.monthStart).then((r) => {
      if (stale) return;
      if (r.ok) setDetail(r.detail);
      else setError(r.error);
    });
    return () => {
      stale = true;
    };
  }, [selection]);

  return (
    <Sheet open={selection != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{selection?.title}</SheetTitle>
          {selection?.description || detail?.countLine ? (
            <SheetDescription>
              {selection?.description ?? detail?.countLine}
              {selection?.description && detail?.countLine
                ? ` · ${detail.countLine}`
                : null}
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 pb-6">
          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : !detail ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-muted h-9 animate-pulse rounded-md" />
              ))}
            </div>
          ) : (
            <>
              {detail.rows.length > 0 ? (
                <ul className="bg-ground flex flex-col overflow-hidden rounded-lg">
                  {detail.rows.map((row) => (
                    <li key={row.id} className="border-b last:border-b-0">
                      <Link
                        href={row.href}
                        className="hover:bg-muted/50 flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {row.primary}
                          </span>
                          {row.secondary ? (
                            <span className="text-muted-foreground truncate text-xs">
                              {row.secondary}
                            </span>
                          ) : null}
                        </span>
                        {row.right ? (
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {row.right}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : !detail.legacyNote ? (
                <p className="text-muted-foreground text-sm">
                  {t("noRecords")}
                </p>
              ) : null}
              {detail.legacyNote ? (
                <p className="text-ink-3 bg-ground rounded-lg p-3 text-xs">
                  {detail.legacyNote}
                </p>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
