import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/section";
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

/**
 * Payments surface for a sales order: how much of the order has been invoiced
 * (deposits + final), with the linked invoices and a "New deposit invoice"
 * CTA. The % bar counts every live (non-cancelled, non-credited) invoice's
 * total against the order total.
 */
export async function PaymentsSection({
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
  const [t, tInvoiceStatus] = await Promise.all([
    getTranslations("soDetail"),
    getTranslations("invoiceStatus"),
  ]);
  const kindLabel: Record<SOInvoiceRow["kind"], string> = {
    standard: t("kindStandard"),
    deposit: t("kindDeposit"),
    final: t("kindFinal"),
  };
  const pct =
    soTotal > 0 ? Math.min(100, Math.max(0, (invoicedTotal / soTotal) * 100)) : 0;
  const remaining = Math.max(0, soTotal - invoicedTotal);

  return (
    <Section
      title={t("paymentsTitle")}
      description={t("paymentsDesc")}
      hue="money"
      contentClassName="flex flex-col gap-3"
      action={
        canDeposit ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/sales-orders/${soId}/deposit/new`}>
              {t("newDepositInvoice")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {soTotal > 0 ? (
        <div className="bg-surface flex flex-col gap-1.5 rounded-lg px-4 py-3">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground text-xs tracking-wide uppercase">
              {t("pctInvoiced", { pct: pct.toFixed(0) })}
            </span>
            <span className="tabular-nums">
              {t("invoicedOf", {
                invoiced: formatPrice(invoicedTotal, currency),
                total: formatPrice(soTotal, currency),
              })}
              {remaining > 0 ? (
                <span className="text-muted-foreground">
                  {t("remainingSuffix", {
                    remaining: formatPrice(remaining, currency),
                  })}
                </span>
              ) : null}
            </span>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-good h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          {t("noInvoices")}
          {canDeposit ? t("noInvoicesCta") : "."}
        </p>
      ) : (
        <div className="bg-surface overflow-hidden rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thInvoice")}</TableHead>
                <TableHead>{t("thType")}</TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="text-right">{t("thTotal")}</TableHead>
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
                  <TableCell className="text-sm">{kindLabel[inv.kind]}</TableCell>
                  <TableCell>
                    <Badge variant={INVOICE_STATUS_VARIANT[inv.status] ?? "outline"}>
                      {tInvoiceStatus.has(inv.status)
                        ? tInvoiceStatus(inv.status)
                        : inv.status}
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
    </Section>
  );
}
