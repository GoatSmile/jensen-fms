import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

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

export type SegmentRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameDa: string | null;
  descriptionEn: string | null;
  descriptionDa: string | null;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
};

/**
 * Server component (no client state needed) — rows are <Link>s into
 * /admin/customer-segments/[id]. Edit + Archive live on the detail
 * page now.
 */
export function SegmentsSection({ rows }: { rows: SegmentRow[] }) {
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Customer segments</h2>
          <span className="text-muted-foreground text-xs">
            {activeCount} active · {rows.length} total
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/customer-segments/new">
            <Plus aria-hidden /> Add segment
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No segments yet. Add one to start.
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="hidden sm:table-cell">Slug</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Sort
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Orgs
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const href = `/admin/customer-segments/${row.id}`;
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.isActive ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        <div className="flex flex-col">
                          <span className="font-medium">{row.nameEn}</span>
                          {row.descriptionEn ? (
                            <span className="text-muted-foreground text-xs">
                              {row.descriptionEn}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 font-mono text-xs sm:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.slug}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.sortOrder}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums lg:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.usageCount}
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
                        aria-label={`Open ${row.nameEn}`}
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
