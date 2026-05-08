import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  STOCK_BADGE_LABEL,
  STOCK_BADGE_VARIANT,
  formatDkk,
  formatQuantity,
  type StockStatus,
} from "@/lib/parts/stock";

export type PartRow = {
  id: string;
  internalSku: string;
  name: string;
  categoryName: string | null;
  supplierName: string | null;
  supplierCount: number;
  stockOnHand: number;
  lastCostDkk: number | null;
  stockStatus: StockStatus;
};

export function PartsTable({ rows }: { rows: PartRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
        No parts match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">SKU</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">Last cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="hover:bg-muted/50 cursor-pointer"
            >
              <TableCell className="p-0">
                <Link href={`/parts/${row.id}`} className="block px-4 py-2.5 font-mono text-xs">
                  {row.internalSku}
                </Link>
              </TableCell>
              <TableCell className="p-0">
                <Link href={`/parts/${row.id}`} className="block px-4 py-2.5 font-medium">
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className="p-0">
                <Link href={`/parts/${row.id}`} className="text-muted-foreground block px-4 py-2.5">
                  {row.categoryName ?? "—"}
                </Link>
              </TableCell>
              <TableCell className="p-0">
                <Link href={`/parts/${row.id}`} className="block px-4 py-2.5">
                  {row.supplierName ? (
                    <span>
                      {row.supplierName}
                      {row.supplierCount > 1 ? (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          +{row.supplierCount - 1}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Link>
              </TableCell>
              <TableCell className="p-0 text-right">
                <Link
                  href={`/parts/${row.id}`}
                  className="flex items-center justify-end gap-2 px-4 py-2.5 tabular-nums"
                >
                  <span>{formatQuantity(row.stockOnHand)}</span>
                  <Badge variant={STOCK_BADGE_VARIANT[row.stockStatus]}>
                    {STOCK_BADGE_LABEL[row.stockStatus]}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell className="p-0 text-right">
                <Link
                  href={`/parts/${row.id}`}
                  className="block px-4 py-2.5 tabular-nums"
                >
                  {formatDkk(row.lastCostDkk)}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
