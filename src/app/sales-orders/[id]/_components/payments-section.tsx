import Link from "next/link";

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
import { formatPrice } from "@/lib/format";
import {
  INVOICE_STATUS_VARIANT,
  invoiceStatusLabel,
  type InvoiceStatus,
} from "@/lib/invoicing/status";

export type SOInvoiceRow = {
  id: string;
  invoice_number: string;
  kind: "standard" | "deposit" | "final";
  status: InvoiceStatus;
  total_amount: number;
  currency: string;
};

const KIND_LABEL: Record<SOInvoiceRow["kind"], string> = {
  standard: "Invoice",
  deposit: "Deposit",
  final: "Final",
};

/**
 * Payments surface for a sales order: how much of the order has been invoiced
 * (deposits + final), with the linked invoices and a "New deposit invoice"
 * CTA. The % bar counts every live (non-cancelled, non-credited) invoice's
 * total against the order total.
 */
export function PaymentsSection({
  soId,
  rows,
  invoicedTotal,
  soTotal,
  currency,
  canDeposit,
}: {
  soId: string;
  rows: SOInvoiceRow[];
  invoicedTotal: number;
  soTotal: number;
  currency: string;
  canDeposit: boolean;
}) {
  const pct =
    soTotal > 0 ? Math.min(100, Math.max(0, (invoicedTotal / soTotal) * 100)) : 0;
  const remaining = Math.max(0, soTotal - invoicedTotal);

  return (
    <section className="rounded-md border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Payments</h2>
          <p className="text-muted-foreground text-xs">
            Deposits and the final invoice for this order. Down payments are taken
            before delivery; the final bills the remaining balance.
          </p>
        </div>
        {canDeposit ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/sales-orders/${soId}/deposit/new`}>
              New deposit invoice
            </Link>
          </Button>
        ) : null}
      </header>

      {soTotal > 0 ? (
        <div className="flex flex-col gap-1.5 border-b px-4 py-3">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground text-xs tracking-wide uppercase">
              {pct.toFixed(0)}% invoiced
            </span>
            <span className="tabular-nums">
              {formatPrice(invoicedTotal, currency)} of{" "}
              {formatPrice(soTotal, currency)}
              {remaining > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {formatPrice(remaining, currency)} remaining
                </span>
              ) : null}
            </span>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No invoices yet
          {canDeposit ? " — take a deposit above, or invoice in full at delivery." : "."}
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-muted/50">
                  <TableCell className="p-0 font-mono text-xs">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="block px-4 py-2.5 hover:underline"
                    >
                      {inv.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{KIND_LABEL[inv.kind]}</TableCell>
                  <TableCell>
                    <Badge variant={INVOICE_STATUS_VARIANT[inv.status] ?? "outline"}>
                      {invoiceStatusLabel(inv.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(inv.total_amount, inv.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
