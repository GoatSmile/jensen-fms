import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/parts/format";

import { EmptyRow, Section } from "./section";

export type PricingRow = {
  id: string;
  price: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isCurrent: boolean;
};

export function PricingHistorySection({ rows }: { rows: PricingRow[] }) {
  return (
    <Section
      title="Retail price history"
      description="Time-bounded retail prices. The current row is the price applied to new orders today."
    >
      {rows.length === 0 ? (
        <EmptyRow>No retail price history yet.</EmptyRow>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]" />
                <TableHead className="text-right">Price</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.isCurrent ? (
                      <Badge variant="success">Current</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoney(row.price, row.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(row.effectiveFrom)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.effectiveTo ? formatDate(row.effectiveTo) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
