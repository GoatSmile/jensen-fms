import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SegmentedId } from "@/components/segmented-id";
import { Section } from "@/components/section";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatDkk } from "@/lib/parts/stock";
import {
  INVOICE_STATUS_VARIANT,
  invoiceStatusLabel,
  type InvoiceStatus,
} from "@/lib/invoicing/status";

import { InvoiceActions } from "../_components/invoice-actions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [invoiceRes, linesRes, wosRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `
          id, invoice_number, status, language, currency, notes,
          issued_date, due_date, paid_date, issued_locked_at, created_at,
          subtotal_amount, total_vat_amount, total_amount,
          ean_number_used, is_reverse_charge, is_export,
          organization:organizations!organization_id(
            id, legal_name, display_name_da, display_name_en
          )
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select(
        `
          id, line_number, description_en, description_da, quantity,
          unit_price, vat_code, vat_rate, line_subtotal, line_vat_amount, line_total
        `,
      )
      .eq("invoice_id", id)
      .order("line_number", { ascending: true }),
    supabase
      .from("work_orders")
      .select("id, wo_number")
      .eq("invoice_id", id)
      .order("wo_number", { ascending: true }),
  ]);

  const invoice = invoiceRes.data;
  if (invoiceRes.error || !invoice) notFound();

  const lines = linesRes.data ?? [];
  const linkedWOs = wosRes.data ?? [];
  const org = Array.isArray(invoice.organization)
    ? invoice.organization[0]
    : invoice.organization;
  const orgName =
    org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? "—";
  const status = invoice.status as InvoiceStatus;
  const danish = invoice.language?.trim() === "da";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/invoices">Invoices</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{invoice.invoice_number}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground font-mono text-xs">
                <SegmentedId value={invoice.invoice_number} />
              </span>
              <Badge variant={INVOICE_STATUS_VARIANT[status] ?? "outline"}>
                {invoiceStatusLabel(status)}
              </Badge>
              <Badge variant="outline" className="font-normal">
                {danish ? "Dansk" : "English"}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {org ? (
                <Link href={`/organizations/${org.id}`} className="hover:underline">
                  {orgName}
                </Link>
              ) : (
                orgName
              )}
            </h1>
            {linkedWOs.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                From{" "}
                {linkedWOs.map((wo, i) => (
                  <span key={wo.id}>
                    {i > 0 ? ", " : ""}
                    <Link
                      href={`/maintenance/work-orders/${wo.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {wo.wo_number}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/invoices/${invoice.id}/print`}>
                <Printer aria-hidden /> Print
              </Link>
            </Button>
            <InvoiceActions invoiceId={invoice.id} status={status} />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Meta label="Issued" value={formatDate(invoice.issued_date)} />
        <Meta label="Due" value={formatDate(invoice.due_date)} />
        <Meta label="Paid" value={formatDate(invoice.paid_date)} />
        <Meta label="Currency" value={invoice.currency?.trim() || "DKK"} />
      </div>

      <Section
        title="Lines"
        description={
          status === "draft"
            ? "Drafted from the work order — issuing locks them."
            : "Locked at issue."
        }
      >
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {l.line_number}
                  </TableCell>
                  <TableCell className="text-sm">
                    {danish ? l.description_da : l.description_en}
                    <div className="text-muted-foreground text-xs">
                      {danish ? l.description_en : l.description_da}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {Number(l.quantity)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatDkk(Number(l.unit_price))}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                    {Number(l.vat_rate)} %
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">
                    {formatDkk(Number(l.line_total))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <dl className="ml-auto mt-3 flex w-full max-w-xs flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">
              {formatDkk(Number(invoice.subtotal_amount))}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT</dt>
            <dd className="tabular-nums">
              {formatDkk(Number(invoice.total_vat_amount))}
            </dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-medium">
            <dt>Total</dt>
            <dd className="tabular-nums">
              {formatDkk(Number(invoice.total_amount))}
            </dd>
          </div>
        </dl>
      </Section>

      {invoice.notes ? (
        <Section title="Notes" description="Internal — not printed on the invoice.">
          <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </Section>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
