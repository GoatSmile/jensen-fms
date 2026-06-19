import Link from "next/link";
import { ChevronRight, Plus, CornerDownRight } from "lucide-react";

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
 * Server component — rows are <Link>s into /admin/categories/[id]. Edit +
 * Archive live on the detail page, matching /admin/hs-codes and
 * /admin/colors. Rows are pre-flattened depth-first; `depth` drives the
 * indentation so the hierarchy reads at a glance.
 */
export function CategoriesSection({ rows }: { rows: CategoryRow[] }) {
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Part categories</h2>
          <span className="text-muted-foreground text-xs">
            {activeCount} active · {rows.length} total
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/categories/new">
            <Plus aria-hidden /> New category
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No categories yet. Add one to start classifying parts.
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
              {rows.map((row) => {
                const href = `/admin/categories/${row.id}`;
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.isActive ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0 text-sm">
                      <Link
                        href={href}
                        className="flex items-center gap-1.5 px-4 py-2.5"
                        style={{ paddingLeft: `${1 + row.depth * 1.5}rem` }}
                      >
                        {row.depth > 0 ? (
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
