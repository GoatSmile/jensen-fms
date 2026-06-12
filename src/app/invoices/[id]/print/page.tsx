import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/parts/print/_components/print-button";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { COMPANY, companyDetailsIncomplete } from "@/lib/invoicing/company";
import { formatDate } from "@/lib/parts/format";
import { formatDkk } from "@/lib/parts/stock";
import type { InvoiceStatus } from "@/lib/invoicing/status";

export const dynamic = "force-dynamic";

/**
 * Print-friendly invoice document — the customer-facing artifact, printed
 * or saved as PDF via the browser (same pattern as the MO parts list).
 * Every label renders in the invoice's language (da/en, frozen on the
 * invoice row); line descriptions use the matching stored translation.
 * Drafts print with a diagonal UDKAST/DRAFT watermark so a draft can be
 * reviewed on paper without passing for a real invoice.
 */
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [invoiceRes, linesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `
          id, invoice_number, status, language, currency, notes,
          issued_date, due_date, paid_date,
          subtotal_amount, total_vat_amount, total_amount,
          ean_number_used, is_reverse_charge, is_export, credited_invoice_id,
          organization:organizations!organization_id(
            id, legal_name, display_name_da, display_name_en,
            address_line1, address_line2, zip_code, city, country_code,
            cvr_number, ean_number, vat_number
          )
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select(
        `line_number, description_en, description_da, quantity,
         unit_price, vat_rate, line_subtotal, line_total`,
      )
      .eq("invoice_id", id)
      .order("line_number", { ascending: true }),
  ]);

  const invoice = invoiceRes.data;
  if (invoiceRes.error || !invoice) notFound();
  const lines = linesRes.data ?? [];
  const org = Array.isArray(invoice.organization)
    ? invoice.organization[0]
    : invoice.organization;

  const da = invoice.language?.trim() === "da";
  const t = (daText: string, enText: string) => (da ? daText : enText);
  const status = invoice.status as InvoiceStatus;
  const isDraft = status === "draft";
  // Self-join embeds are direction-ambiguous on PostgREST — explicit fetch.
  const creditedOriginal = invoice.credited_invoice_id
    ? (
        await supabase
          .from("invoices")
          .select("invoice_number, issued_date")
          .eq("id", invoice.credited_invoice_id)
          .maybeSingle()
      ).data
    : null;
  const orgName =
    (da
      ? (org?.display_name_da ?? org?.display_name_en)
      : (org?.display_name_en ?? org?.display_name_da)) ??
    org?.legal_name ??
    "—";
  // EAN: the issue-time snapshot wins; drafts preview the org's current one.
  const ean = invoice.ean_number_used ?? org?.ean_number ?? null;

  return (
    <div className="relative mx-auto flex max-w-3xl flex-col gap-8 p-6 print:max-w-none print:p-0">
      {isDraft ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="-rotate-30 text-[6rem] font-bold tracking-widest text-black/[0.07] select-none">
            {t("UDKAST", "DRAFT")}
          </span>
        </div>
      ) : null}

      <div className="print-hidden flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="text-muted-foreground text-sm">
          <Link href={`/invoices/${invoice.id}`} className="underline underline-offset-4">
            ← {t("Tilbage til fakturaen", "Back to the invoice")}
          </Link>
          {companyDetailsIncomplete() ? (
            <span className="text-destructive ml-3">
              {t(
                "Firmaoplysninger mangler (CVR, bank) — udfyld src/lib/invoicing/company.ts.",
                "Company details incomplete (CVR, bank) — fill in src/lib/invoicing/company.ts.",
              )}
            </span>
          ) : null}
        </div>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {creditedOriginal
              ? t("Kreditnota", "Credit note")
              : t("Faktura", "Invoice")}
          </h1>
          <div className="text-sm">
            <div className="font-mono">{invoice.invoice_number}</div>
            {creditedOriginal ? (
              <div className="text-muted-foreground">
                {t("Kreditnota til faktura", "Credit note for invoice")}{" "}
                {creditedOriginal.invoice_number}
                {creditedOriginal.issued_date
                  ? ` (${formatDate(creditedOriginal.issued_date)})`
                  : ""}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <Logo heightClass="h-10" />
          <div className="text-xs leading-relaxed">
            <div className="font-medium">{COMPANY.name}</div>
            <div>{COMPANY.addressLine1}</div>
            <div>
              {COMPANY.zipCity}, {da ? COMPANY.countryDa : COMPANY.countryEn}
            </div>
            <div>
              {t("CVR-nr.", "CVR no.")} {COMPANY.cvr}
            </div>
            <div>{COMPANY.email}</div>
          </div>
        </div>
      </header>

      <div className="flex items-start justify-between gap-6">
        <div className="text-sm leading-relaxed">
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            {t("Faktureres til", "Bill to")}
          </div>
          <div className="mt-1 font-medium">{orgName}</div>
          {org?.legal_name && org.legal_name !== orgName ? (
            <div>{org.legal_name}</div>
          ) : null}
          {org?.address_line1 ? <div>{org.address_line1}</div> : null}
          {org?.address_line2 ? <div>{org.address_line2}</div> : null}
          {org?.zip_code || org?.city ? (
            <div>
              {[org?.zip_code, org?.city].filter(Boolean).join(" ")}
            </div>
          ) : null}
          {org?.cvr_number ? (
            <div>
              {t("CVR-nr.", "CVR no.")} {org.cvr_number}
            </div>
          ) : null}
          {ean ? (
            <div>
              {t("EAN-nr.", "EAN no.")} {ean}
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("Fakturadato", "Invoice date")}</dt>
          <dd className="text-right tabular-nums">{formatDate(invoice.issued_date)}</dd>
          <dt className="text-muted-foreground">{t("Forfaldsdato", "Due date")}</dt>
          <dd className="text-right tabular-nums">{formatDate(invoice.due_date)}</dd>
          {invoice.paid_date ? (
            <>
              <dt className="text-muted-foreground">{t("Betalt", "Paid")}</dt>
              <dd className="text-right tabular-nums">{formatDate(invoice.paid_date)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t("Valuta", "Currency")}</dt>
          <dd className="text-right">{invoice.currency?.trim() || "DKK"}</dd>
        </dl>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">
              {t("Beskrivelse", "Description")}
            </th>
            <th className="py-1.5 pr-2 text-right font-medium">
              {t("Antal", "Qty")}
            </th>
            <th className="py-1.5 pr-2 text-right font-medium">
              {t("Enhedspris", "Unit price")}
            </th>
            <th className="py-1.5 pr-2 text-right font-medium">
              {t("Moms", "VAT")}
            </th>
            <th className="py-1.5 text-right font-medium">
              {t("Beløb", "Amount")}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.line_number} className="border-b align-top">
              <td className="text-muted-foreground py-1.5 pr-2 tabular-nums">
                {l.line_number}
              </td>
              <td className="py-1.5 pr-2">
                {da ? (l.description_da ?? l.description_en) : (l.description_en ?? l.description_da)}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {Number(l.quantity)}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {formatDkk(Number(l.unit_price))}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {Number(l.vat_rate)} %
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {formatDkk(Number(l.line_subtotal))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Subtotal", "Subtotal")}</span>
          <span className="tabular-nums">
            {formatDkk(Number(invoice.subtotal_amount))}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t("Moms (25 %)", "VAT (25 %)")}
          </span>
          <span className="tabular-nums">
            {formatDkk(Number(invoice.total_vat_amount))}
          </span>
        </div>
        <div className="flex justify-between border-t-2 border-black pt-1 text-base font-semibold">
          <span>{t("I alt", "Total")}</span>
          <span className="tabular-nums">
            {formatDkk(Number(invoice.total_amount))}
          </span>
        </div>
      </div>

      {invoice.is_reverse_charge ? (
        <p className="text-xs">
          {t(
            "Omvendt betalingspligt — køber afregner momsen.",
            "Reverse charge — VAT to be accounted for by the recipient.",
          )}
        </p>
      ) : null}
      {invoice.is_export ? (
        <p className="text-xs">
          {t("Eksport — 0 % moms.", "Export — zero-rated VAT.")}
        </p>
      ) : null}

      <footer className="mt-auto border-t pt-3 text-xs leading-relaxed">
        <div className="font-medium">
          {t("Betalingsoplysninger", "Payment details")}
        </div>
        <div>
          {COMPANY.bank.name} · {t("reg.nr.", "reg. no.")} {COMPANY.bank.regNumber} ·{" "}
          {t("kontonr.", "account no.")} {COMPANY.bank.accountNumber}
        </div>
        {!creditedOriginal ? (
          <div className="text-muted-foreground mt-1">
            {t(
              `Angiv venligst fakturanummer ${invoice.invoice_number} ved betaling.`,
              `Please reference invoice number ${invoice.invoice_number} with your payment.`,
            )}
          </div>
        ) : null}
      </footer>
    </div>
  );
}
