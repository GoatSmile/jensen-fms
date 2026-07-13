"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsUpDown,
  CornerDownRight,
  Plus,
  Search,
} from "lucide-react";

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

export type CategoryRow = {
  id: string;
  name_en: string;
  name_da: string | null;
  depth: number;
  isActive: boolean;
  /** Parts directly in this category (not descendants). */
  partCount: number;
  /** Manual display order (part_categories.sort_order). */
  sortOrder: number;
};

/** Sortable columns; "hierarchy" is the default tree view (by sort_order). */
type SortKey = "hierarchy" | "name" | "parts" | "status" | "order";
type SortDir = "asc" | "desc";

/**
 * Rows are <Link>s into /admin/categories/[id]; edit + archive live on the
 * detail page (matching /admin/hs-codes, /admin/colors). Rows arrive
 * pre-flattened depth-first (by sort_order, then name) so `depth` drives
 * indentation in the default view.
 *
 * The search box filters client-side on name (en + da); the column headers
 * sort client-side — both instant for a small, admin-only list. The default
 * "hierarchy" view keeps parent → child indentation ordered by sort_order.
 * Clicking a header switches to a FLAT sort by that column (▲ asc → ▼ desc →
 * back to hierarchy); while searching, rows also render flat since a matched
 * child's parent may be filtered out.
 */
export function CategoriesSection({ rows }: { rows: CategoryRow[] }) {
  const t = useTranslations("adminCategories");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("hierarchy");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name_en.toLowerCase().includes(q) ||
        (r.name_da?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, q]);

  const displayed = useMemo(() => {
    if (sortKey === "hierarchy") return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const byName = (a: CategoryRow, b: CategoryRow) =>
      a.name_en.localeCompare(b.name_en);
    const cmp = (a: CategoryRow, b: CategoryRow) => {
      switch (sortKey) {
        case "name":
          return byName(a, b) * dir;
        case "parts":
          return (a.partCount - b.partCount) * dir || byName(a, b);
        case "status":
          return (Number(b.isActive) - Number(a.isActive)) * dir || byName(a, b);
        case "order":
          return (a.sortOrder - b.sortOrder) * dir || byName(a, b);
        default:
          return 0;
      }
    };
    return [...filtered].sort(cmp);
  }, [filtered, sortKey, sortDir]);

  const activeCount = rows.filter((r) => r.isActive).length;
  const searching = q.length > 0;
  // A sorted or searched view can't render the tree, so drop indentation.
  const flat = searching || sortKey !== "hierarchy";

  // asc → desc → back to hierarchy default.
  function toggleSort(col: Exclude<SortKey, "hierarchy">) {
    if (sortKey !== col) {
      setSortKey(col);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey("hierarchy");
      setSortDir("asc");
    }
  }

  function SortHeader({
    col,
    label,
    className,
    align = "left",
  }: {
    col: Exclude<SortKey, "hierarchy">;
    label: string;
    className?: string;
    align?: "left" | "right";
  }) {
    const active = sortKey === col;
    return (
      <TableHead
        className={className}
        aria-sort={
          active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
        }
      >
        <button
          type="button"
          onClick={() => toggleSort(col)}
          className={`hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 ${
            align === "right" ? "flex-row-reverse" : ""
          } ${active ? "text-foreground" : ""}`}
        >
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp className="size-3.5" aria-hidden />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden />
            )
          ) : (
            <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
          )}
        </button>
      </TableHead>
    );
  }

  return (
    <section className="rounded-md border">
      <header className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <span className="text-muted-foreground text-xs">
            {searching
              ? t("countShown", { shown: filtered.length, total: rows.length })
              : t("countSummary", { active: activeCount, total: rows.length })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAria")}
              className="h-8 w-full pl-8 sm:w-56"
            />
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/categories/new">
              <Plus aria-hidden /> {t("newCategory")}
            </Link>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          {t("emptyState")}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          {t("noMatch", { query })}
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader col="name" label={t("colName")} />
                <SortHeader
                  col="parts"
                  label={t("colParts")}
                  align="right"
                  className="hidden [&>button]:justify-end md:table-cell md:text-right"
                />
                <SortHeader col="status" label={t("colStatus")} />
                <SortHeader
                  col="order"
                  label={t("colOrder")}
                  align="right"
                  className="[&>button]:justify-end text-right"
                />
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((row) => {
                const href = `/admin/categories/${row.id}`;
                // Indentation only makes sense in the default hierarchy view.
                const depth = flat ? 0 : row.depth;
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.isActive ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0 text-sm">
                      <Link
                        href={href}
                        className="flex items-center gap-1.5 px-4 py-2.5"
                        style={{ paddingLeft: `${1 + depth * 1.5}rem` }}
                      >
                        {depth > 0 ? (
                          <CornerDownRight
                            className="text-muted-foreground/50 size-3.5 shrink-0"
                            aria-hidden
                          />
                        ) : null}
                        <span className="font-medium">{row.name_en}</span>
                        {row.name_da ? (
                          <span className="text-muted-foreground text-xs">
                            {row.name_da}
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.partCount}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.isActive ? (
                          <Badge variant="success">{t("active")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("archived")}</Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground p-0 text-right tabular-nums">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.sortOrder}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right">
                      <Link
                        href={href}
                        className="text-muted-foreground block px-3 py-2.5"
                        aria-label={t("openAria", { name: row.name_en })}
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
