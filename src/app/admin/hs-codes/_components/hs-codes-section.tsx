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
import { formatPct } from "@/lib/parts/format";

export type HsCodeRow = {
  id: string;
  code: string;
  description: string;
  tariffPct: number;
  notes: string | null;
  isActive: boolean;
  partCount: number;
};

/**
 * Server component — rows are <Link>s into /admin/hs-codes/[id]. Edit
 * + Archive live on the detail page now, matching /admin/colors and
 * /admin/customer-segments.
 */
export function HsCodesSection({ rows }: { rows: HsCodeRow[] }) {
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">HS / TARIC codes</h2>
          <span className="text-muted-foreground text-xs">
            {activeCount} active · {rows.length} total
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/hs-codes/new">
            <Plus aria-hidden /> Add code
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No HS codes yet. Add one to start classifying parts.
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Tariff</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Parts
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const href = `/admin/hs-codes/${row.id}`;
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.isActive ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0 font-mono text-xs">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.code}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-sm">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.description}
                        {row.notes ? (
                          <div className="text-muted-foreground text-xs">
                            {row.notes}
                          </div>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right tabular-nums">
                      <Link href={href} className="block px-4 py-2.5">
                        {formatPct(row.tariffPct)}
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
                        aria-label={`Open ${row.code}`}
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
