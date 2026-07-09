import Link from "next/link";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/empty-state";
import { SegmentedId } from "@/components/segmented-id";
import { Section } from "@/components/section";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatDkk } from "@/lib/parts/stock";
import { findUnbilledFeePeriods } from "@/lib/invoicing/agreement-fees";
import {
  findAgreementMonthlyFees,
  findUninvoicedSOs,
  findUninvoicedWOs,
} from "@/lib/invoicing/uninvoiced";
import {
  INVOICE_STATUS_VARIANT,
  invoiceStatusLabel,
  round2,
  type InvoiceStatus,
} from "@/lib/invoicing/status";

import { CreateInvoiceButton } from "./_components/create-invoice-button";
import { DraftFeeInvoicesButton } from "./_components/draft-fee-invoices-button";

export default async function InvoicesPage() {
  const supabase = await createClient();

  const [wosRes, sosRes, feesRes, unbilledRes, invoicesRes] = await Promise.all([
    findUninvoicedWOs(supabase),
    findUninvoicedSOs(supabase),
    findAgreementMonthlyFees(supabase),
    findUnbilledFeePeriods(supabase),
    supabase
      .from("invoices")
      .select(
        `
          id, invoice_number, status, issued_date, due_date, total_amount, currency,
          organization:organizations!organization_id(
            id, legal_name, display_name_da, display_name_en
          )
        `,
      )
      .order("created_at", { ascending: false }),
  ]);

  const wos = "error" in wosRes ? [] : wosRes;
  const sos = "error" in sosRes ? [] : sosRes;
  const fees = "error" in feesRes ? [] : feesRes;
  const unbilled = "error" in unbilledRes ? { periods: [], skipped: [] } : unbilledRes;
  const loadErrors = [
    "error" in wosRes ? wosRes.error : null,
    "error" in sosRes ? sosRes.error : null,
    "error" in feesRes ? feesRes.error : null,
    "error" in unbilledRes ? unbilledRes.error : null,
    invoicesRes.error ? `Could not load invoices: ${invoicesRes.error.message}` : null,
  ].filter(Boolean);
  const invoices = invoicesRes.data ?? [];

  const woTotal = round2(wos.reduce((s, w) => s + w.total, 0));
  const soTotal = round2(sos.reduce((s, so) => s + so.total, 0));
  const feeTotal = round2(fees.reduce((s, f) => s + f.monthlyFee, 0));
  const unbilledByAgreement = new Map<string, number>();
  for (const p of unbilled.periods) {
    unbilledByAgreement.set(
      p.agreementId,
      round2((unbilledByAgreement.get(p.agreementId) ?? 0) + p.fee),
    );
  }
  const feesDue = round2(
    unbilled.periods.reduce((s, p) => s + p.fee, 0),
  );

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
              <BreadcrumbPage>Invoices</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground text-sm">
            Uninvoiced work first — then everything already drafted or issued.
          </p>
        </div>
      </header>

      {loadErrors.length > 0 ? (
        <p className="text-destructive text-sm" role="alert">
          {loadErrors.join(" ")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Uninvoiced work orders" value={formatDkk(woTotal)} sub={`${wos.length} ready`} />
        <Kpi label="Delivered sales orders" value={formatDkk(soTotal)} sub={`${sos.length} uninvoiced`} />
        <Kpi label="Agreement fees" value={`${formatDkk(feeTotal)}/md.`} sub={`${formatDkk(feesDue)} unbilled`} />
        <Kpi label="Invoices" value={String(invoices.length)} sub="all time" />
      </div>

      <Section
        title="Work orders ready to invoice"
        description="Completed, billable, not yet on an invoice. Value is parts at retail plus labor, minus what the customer's agreement covers."
        className="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20"
      >
        {wos.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing waiting — completed billable work orders land here.
          </p>
        ) : (
          <div className="bg-background overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Completed</TableHead>
                  <TableHead className="text-right">Parts</TableHead>
                  <TableHead className="text-right">Labor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[150px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {wos.map((wo) => (
                  <TableRow key={wo.woId}>
                    <TableCell className="text-xs">
                      <Link
                        href={`/maintenance/work-orders/${wo.woId}`}
                        className="hover:underline"
                      >
                        <SegmentedId value={wo.woNumber} />
                      </Link>
                      {wo.frameNumber ? (
                        <div className="text-muted-foreground">{wo.frameNumber}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {wo.orgName ?? (
                        <span className="text-muted-foreground italic">No owner</span>
                      )}
                      {wo.coverageNote ? (
                        <div className="text-muted-foreground text-xs">
                          {wo.coverageNote}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                      {formatDate(wo.completedAt)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatDkk(wo.partsTotal)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatDkk(wo.laborTotal)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {formatDkk(wo.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <CreateInvoiceButton
                        source={{ kind: "wo", woId: wo.woId }}
                        disabledReason={wo.orgId ? null : "Assign an owner first"}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section
        title="Delivered sales orders"
        description="Delivered with no invoice yet. Lines copy from the SO; frame numbers of the delivered bikes land in the descriptions."
        className="border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
      >
        {sos.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No delivered sales orders are waiting for an invoice.
          </p>
        ) : (
          <div className="bg-background overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Delivered</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[150px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sos.map((so) => (
                  <TableRow key={so.soId}>
                    <TableCell className="text-xs">
                      <Link href={`/sales-orders/${so.soId}`} className="hover:underline">
                        <SegmentedId value={so.soNumber} />
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {so.orgName ?? (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                      {formatDate(so.deliveredDate)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {so.currency === "DKK"
                        ? formatDkk(so.total)
                        : `${so.total} ${so.currency}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <CreateInvoiceButton source={{ kind: "so", soId: so.soId }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section
        title="Agreement fees"
        description="Billed in arrears, one invoice per customer, one line per agreement-month. Partial months are pro-rated by days."
        className="border-violet-200/70 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20"
      >
        {fees.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active service agreements carry a monthly fee.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <DraftFeeInvoicesButton />
            <div className="bg-background overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agreement</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Fee / month</TableHead>
                    <TableHead className="text-right">Unbilled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fees.map((f) => {
                    const due = unbilledByAgreement.get(f.agreementId) ?? 0;
                    return (
                      <TableRow key={f.agreementId}>
                        <TableCell className="text-sm">
                          <Link
                            href={`/service-agreements/${f.agreementId}`}
                            className="hover:underline"
                          >
                            {f.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {f.orgName ?? (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {f.currency === "DKK"
                            ? formatDkk(f.monthlyFee)
                            : `${f.monthlyFee} ${f.currency}`}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {due > 0 ? (
                            formatDkk(due)
                          ) : (
                            <span className="text-muted-foreground font-normal">
                              up to date
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Invoices"
        description="Drafts, issued and paid."
        className="border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20"
      >
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create the first one from a completed work order above."
          />
        ) : (
          <div className="bg-background overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Issued</TableHead>
                  <TableHead className="hidden md:table-cell">Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const org = Array.isArray(inv.organization)
                    ? inv.organization[0]
                    : inv.organization;
                  const name =
                    org?.display_name_da ?? org?.display_name_en ?? org?.legal_name;
                  const href = `/invoices/${inv.id}`;
                  return (
                    <TableRow key={inv.id} className="hover:bg-muted/50">
                      <TableCell className="p-0 text-xs">
                        <Link href={href} className="block px-4 py-2.5">
                          <SegmentedId value={inv.invoice_number} />
                        </Link>
                      </TableCell>
                      <TableCell className="p-0 text-sm">
                        <Link href={href} className="block px-4 py-2.5">
                          {name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="p-0">
                        <Link href={href} className="block px-4 py-2.5">
                          <Badge
                            variant={
                              INVOICE_STATUS_VARIANT[inv.status as InvoiceStatus] ??
                              "outline"
                            }
                          >
                            {invoiceStatusLabel(inv.status)}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                        <Link href={href} className="block px-4 py-2.5">
                          {formatDate(inv.issued_date)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                        <Link href={href} className="block px-4 py-2.5">
                          {formatDate(inv.due_date)}
                        </Link>
                      </TableCell>
                      <TableCell className="p-0 text-right text-sm font-medium tabular-nums">
                        <Link href={href} className="block px-4 py-2.5">
                          {formatDkk(Number(inv.total_amount ?? 0))}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{sub}</div>
    </div>
  );
}
