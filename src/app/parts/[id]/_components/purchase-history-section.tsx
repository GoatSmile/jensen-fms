import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatFactor,
  formatFxRate,
  formatMoney,
} from "@/lib/parts/format";
import { formatDkk, formatQuantity } from "@/lib/parts/stock";

import { EmptyRow, Section } from "./section";

export type PurchaseLineRow = {
  id: string;
  poId: string;
  poNumber: string;
  orderDate: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  currency: string;
  fxRateToDkk: number;
  transportFactor: number;
  landedCostDkkPerUnit: number;
};

export function PurchaseHistorySection({ rows }: { rows: PurchaseLineRow[] }) {
  return (
    <Section
      title="Purchase history"
      description="Last 10 purchase order lines. The DKK landed cost is unit price × FX rate × transport factor — frozen at the moment of purchase."
    >
      {rows.length === 0 ? (
        <EmptyRow>No purchases recorded for this part yet.</EmptyRow>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead className="w-[110px]">Order date</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">FX → DKK</TableHead>
                <TableHead className="text-right">Transport ×</TableHead>
                <TableHead className="text-right">Landed DKK / unit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const partialReceipt =
                  row.receivedQuantity > 0 &&
                  row.receivedQuantity < row.quantity;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/purchase-orders/${row.poId}`}
                        className="hover:underline"
                      >
                        {row.poNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(row.orderDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.quantity)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        partialReceipt
                          ? "text-amber-700 dark:text-amber-300"
                          : ""
                      }`}
                    >
                      {formatQuantity(row.receivedQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.unitPrice, row.currency, {
                        maximumFractionDigits: 4,
                      })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatFxRate(row.fxRateToDkk)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatFactor(row.transportFactor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatDkk(row.landedCostDkkPerUnit)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
