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
import { countryName } from "@/lib/countries";

export type SupplierRow = {
  id: string;
  name: string;
  countryCode: string | null;
  defaultCurrency: string | null;
  isActive: boolean;
  partCount: number;
  /** Primary contact email (where POs will be sent); null when not yet set. */
  emailPrimary: string | null;
};

/**
 * Server component — rows link into /admin/suppliers/[id]. Edit +
 * archive live on the detail page, matching the other admin
 * controlled-vocab sections.
 */
export function SuppliersSection({ rows }: { rows: SupplierRow[] }) {
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Suppliers</h2>
          <span className="text-muted-foreground text-xs">
            {activeCount} active · {rows.length} total
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/suppliers/new">
            <Plus aria-hidden /> Add supplier
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No suppliers yet. Add one to start.
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="hidden sm:table-cell">Country</TableHead>
                <TableHead className="hidden md:table-cell">Currency</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Parts
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const href = `/admin/suppliers/${row.id}`;
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.isActive ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0 font-medium">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-sm sm:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.countryCode ? (
                          countryName(row.countryCode)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 font-mono text-xs md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.defaultCurrency ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 font-mono text-xs lg:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.emailPrimary ? (
                          <span className="break-all">{row.emailPrimary}</span>
                        ) : (
                          <span className="font-sans text-amber-700 dark:text-amber-400">
                            Set email
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums lg:table-cell">
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
                        aria-label={`Open ${row.name}`}
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
