"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, CornerDownRight, Search } from "lucide-react";

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
};

/**
 * Rows are <Link>s into /admin/categories/[id]; edit + archive live on the
 * detail page (matching /admin/hs-codes, /admin/colors). Rows arrive
 * pre-flattened depth-first so `depth` drives indentation. The search box
 * filters client-side on name (en + da) — instant feedback for a small,
 * admin-only list. While filtering, matches render flat (no indentation),
 * since a matched child's parent may be filtered out.
 */
export function CategoriesSection({ rows }: { rows: CategoryRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name_en.toLowerCase().includes(q) ||
        (r.name_da?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, q]);

  const activeCount = rows.filter((r) => r.isActive).length;
  const searching = q.length > 0;

  return (
    <section className="rounded-md border">
      <header className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Part categories</h2>
          <span className="text-muted-foreground text-xs">
            {searching
              ? `${filtered.length} of ${rows.length} shown`
              : `${activeCount} active · ${rows.length} total`}
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
              placeholder="Search categories…"
              aria-label="Search categories"
              className="h-8 w-full pl-8 sm:w-56"
            />
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/categories/new">
              <Plus aria-hidden /> New category
            </Link>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No categories yet. Add one to start classifying parts.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No categories match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Parts
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const href = `/admin/categories/${row.id}`;
                // Indentation only makes sense in the full tree view.
                const depth = searching ? 0 : row.depth;
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
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="outline">Archived</Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right">
                      <Link
                        href={href}
                        className="text-muted-foreground block px-3 py-2.5"
                        aria-label={`Open ${row.name_en}`}
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
