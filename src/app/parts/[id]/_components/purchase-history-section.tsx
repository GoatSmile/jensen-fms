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
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead className="hidden w-[110px] sm:table-cell">
                  Order date
                </TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Received
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Unit price
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  FX → DKK
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Transport ×
                </TableHead>
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
                    <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                      {formatDate(row.orderDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.quantity)}
                    </TableCell>
                    <TableCell
                      className={`hidden text-right tabular-nums md:table-cell ${
                        partialReceipt
                          ? "text-amber-700 dark:text-amber-300"
                          : ""
                      }`}
                    >
                      {formatQuantity(row.receivedQuantity)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {formatMoney(row.unitPrice, row.currency, {
                        maximumFractionDigits: 4,
                      })}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {formatFxRate(row.fxRateToDkk)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
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
