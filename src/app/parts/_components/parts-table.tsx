import Link from "next/link";
import { ImageIcon } from "lucide-react";

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

import { SortableHeader } from "./sortable-header";

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
  heroUrl: string | null;
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
            <TableHead className="w-[44px]" />
            <SortableHeader
              column="internal_sku"
              label="SKU"
              className="w-[140px]"
            />
            <SortableHeader column="name_en" label="Name" />
            <SortableHeader
              column="category_name"
              label="Category"
              className="hidden md:table-cell"
            />
            <SortableHeader
              column="primary_supplier_name"
              label="Supplier"
              className="hidden lg:table-cell"
            />
            <SortableHeader
              column="stock_on_hand"
              label="Stock"
              align="right"
              className="text-right"
            />
            <SortableHeader
              column="last_cost_dkk"
              label="Last cost"
              align="right"
              className="hidden text-right md:table-cell"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="hover:bg-muted/50 cursor-pointer"
            >
              <TableCell className="p-0">
                <Link
                  href={`/parts/${row.id}`}
                  className="flex items-center justify-center px-2 py-1.5"
                  aria-hidden
                  tabIndex={-1}
                >
                  {row.heroUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- See photo-thumb.tsx
                    <img
                      src={row.heroUrl}
                      alt=""
                      className="size-8 rounded border object-cover"
                    />
                  ) : (
                    <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded border border-dashed">
                      <ImageIcon aria-hidden className="size-3.5" />
                    </span>
                  )}
                </Link>
              </TableCell>
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
              <TableCell className="hidden p-0 md:table-cell">
                <Link href={`/parts/${row.id}`} className="text-muted-foreground block px-4 py-2.5">
                  {row.categoryName ?? "—"}
                </Link>
              </TableCell>
              <TableCell className="hidden p-0 lg:table-cell">
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
              <TableCell className="hidden p-0 text-right md:table-cell">
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
