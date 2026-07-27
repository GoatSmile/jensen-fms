import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
  type InvoiceStatus,
} from "@/lib/invoicing/status";

import { InvoiceActions } from "../_components/invoice-actions";
import { EconomicSyncCard } from "../_components/economic-sync-card";
import { economicEnvReady } from "@/lib/economic/client";
import {
  economicConfigGaps,
  loadEconomicSettings,
} from "@/lib/economic/settings";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tInvoices, tCommon, tStatus] = await Promise.all([
    getTranslations("invoiceDetail"),
    getTranslations("invoices"),
    getTranslations("common"),
    getTranslations("invoiceStatus"),
  ]);
  const supabase = await createClient();

  const [invoiceRes, linesRes, wosRes, creditNoteRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `
          id, invoice_number, kind, status, language, currency, notes,
          issued_date, due_date, paid_date, issued_locked_at, created_at,
          subtotal_amount, total_vat_amount, total_amount,
          ean_number_used, is_reverse_charge, is_export, credited_invoice_id,
          economic_voucher_id, economic_synced_at,
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
    supabase
      .from("invoices")
      .select("id, invoice_number, status")
      .eq("credited_invoice_id", id)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle(),
  ]);

  const invoice = invoiceRes.data;
  if (invoiceRes.error || !invoice) notFound();

  const lines = linesRes.data ?? [];
  const linkedWOs = wosRes.data ?? [];
  // Self-join embeds are direction-ambiguous on PostgREST — fetch the
  // credited original explicitly instead.
  const creditedOriginal = invoice.credited_invoice_id
    ? (
        await supabase
          .from("invoices")
          .select("id, invoice_number")
          .eq("id", invoice.credited_invoice_id)
          .maybeSingle()
      ).data
    : null;
  const creditNote = creditNoteRes.data;
  const org = Array.isArray(invoice.organization)
    ? invoice.organization[0]
    : invoice.organization;
  const orgName =
    org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? "—";
  const status = invoice.status as InvoiceStatus;
  const danish = invoice.language?.trim() === "da";

  // e-conomic sync strip — shown for issued invoices once the integration
  // is switched on (Admin → Settings → Accounting).
  const economicSettings = await loadEconomicSettings(supabase);
  const showEconomic =
    economicSettings.enabled && !["draft", "cancelled"].includes(status);
  const economicGaps = economicConfigGaps(economicSettings);
  const economicBlockedReason = !economicEnvReady()
    ? t("economicNoTokens")
    : economicGaps.length > 0
      ? t("economicConfigIncomplete", { gaps: economicGaps.join(", ") })
      : null;
  const economicSyncedLabel = invoice.economic_voucher_id
    ? `${invoice.economic_voucher_id}${invoice.economic_synced_at ? ` · ${formatDate(invoice.economic_synced_at.slice(0, 10))}` : ""}`
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{tCommon("crumbDashboard")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/invoices">{tInvoices("title")}</Link>
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
                {tStatus.has(status) ? tStatus(status) : status}
              </Badge>
              {invoice.kind === "deposit" ? (
                <Badge variant="secondary" className="font-normal">
                  {t("kindDeposit")}
                </Badge>
              ) : invoice.kind === "final" ? (
                <Badge variant="secondary" className="font-normal">
                  {t("kindFinal")}
                </Badge>
              ) : null}
              {creditedOriginal ? (
                <Badge variant="secondary" className="font-normal">
                  {t("creditNoteBadge")}
                </Badge>
              ) : null}
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
                {t("fromWos")}
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
            {creditedOriginal ? (
              <p className="text-muted-foreground text-sm">
                {t("credits")}
                <Link
                  href={`/invoices/${creditedOriginal.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {creditedOriginal.invoice_number}
                </Link>
              </p>
            ) : null}
            {creditNote ? (
              <p className="text-muted-foreground text-sm">
                {t("creditedBy")}
                <Link
                  href={`/invoices/${creditNote.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {creditNote.invoice_number}
                </Link>
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/invoices/${invoice.id}/print`}>
                <Printer aria-hidden /> {t("print")}
              </Link>
            </Button>
            <InvoiceActions
              invoiceId={invoice.id}
              status={status}
              isCreditNote={!!creditedOriginal}
              hasLiveCreditNote={!!creditNote}
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Meta label={t("metaIssued")} value={formatDate(invoice.issued_date)} />
        <Meta label={t("metaDue")} value={formatDate(invoice.due_date)} />
        <Meta label={t("metaPaid")} value={formatDate(invoice.paid_date)} />
        <Meta label={t("metaCurrency")} value={invoice.currency?.trim() || "DKK"} />
      </div>

      {showEconomic ? (
        <EconomicSyncCard
          invoiceId={invoice.id}
          syncedLabel={economicSyncedLabel}
          blockedReason={economicBlockedReason}
        />
      ) : null}

      <Section
        title={t("linesTitle")}
        description={
          status !== "draft"
            ? t("linesDescLocked")
            : invoice.kind === "deposit"
              ? t("linesDescDeposit")
              : invoice.kind === "final"
                ? t("linesDescFinal")
                : t("linesDescDraft")
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>{t("thDescription")}</TableHead>
              <TableHead className="text-right">{t("thQty")}</TableHead>
              <TableHead className="text-right">{t("thUnitPrice")}</TableHead>
              <TableHead className="text-right">{t("thVat")}</TableHead>
              <TableHead className="text-right">{t("thTotal")}</TableHead>
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

        <dl className="ml-auto mt-3 flex w-full max-w-xs flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("subtotal")}</dt>
            <dd className="tabular-nums">
              {formatDkk(Number(invoice.subtotal_amount))}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("vat")}</dt>
            <dd className="tabular-nums">
              {formatDkk(Number(invoice.total_vat_amount))}
            </dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-medium">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">
              {formatDkk(Number(invoice.total_amount))}
            </dd>
          </div>
        </dl>
      </Section>

      {invoice.notes ? (
        <Section title={t("notesTitle")} description={t("notesDesc")}>
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
