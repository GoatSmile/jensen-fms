import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/parts/print/_components/print-button";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { COMPANY, companyDetailsIncomplete } from "@/lib/invoicing/company";
import { formatDate } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import { loadIssuedOfferDocument } from "@/lib/offers/offer-document";

export const dynamic = "force-dynamic";

/**
 * The offer as the customer receives it — printed, or saved as PDF by the
 * browser, the same way invoices and paint orders are.
 *
 * Every label is in the OFFER's language, not the UI locale. A draft prints
 * with a UDKAST/DRAFT watermark so it can be reviewed on paper without passing
 * for a real quote, and a revision beyond the first prints its number: two
 * documents can bear OFF-2026-0001 and the reader must be able to tell them
 * apart.
 */
export default async function OfferPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  // AS ISSUED, not as it would look today: past draft this is the snapshot
  // taken at send, so reprinting an offer shows the customer's copy rather
  // than a re-render against current prices.
  const { doc } = await loadIssuedOfferDocument(supabase, id);
  if (!doc) notFound();

  const L = doc.labels;
  const da = doc.language === "da";

  return (
    <div className="relative mx-auto flex max-w-3xl flex-col gap-8 p-6 print:max-w-none print:p-0">
      {doc.isDraft ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="-rotate-30 text-[6rem] font-bold tracking-widest text-black/[0.07] select-none">
            {L.draftWatermark}
          </span>
        </div>
      ) : null}

      <div className="print-hidden flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="text-muted-foreground text-sm">
          <Link
            href={`/offers/${doc.id}`}
            className="underline underline-offset-4"
          >
            ← {da ? "Tilbage til tilbuddet" : "Back to the offer"}
          </Link>
          {companyDetailsIncomplete() ? (
            <span className="text-destructive ml-3">
              {da
                ? "Firmaoplysninger mangler (CVR, adresse) — udfyld src/lib/invoicing/company.ts."
                : "Company details incomplete (CVR, address) — fill in src/lib/invoicing/company.ts."}
            </span>
          ) : null}
        </div>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{L.title}</h1>
          <div className="text-sm">
            <div className="font-mono">{doc.offerNumber}</div>
            {doc.revision > 1 ? (
              <div className="text-muted-foreground">
                {L.revision} {doc.revision}
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
              {L.cvrNo} {COMPANY.cvr}
            </div>
            <div>{COMPANY.email}</div>
          </div>
        </div>
      </header>

      <div className="flex items-start justify-between gap-6">
        <div className="text-sm leading-relaxed">
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            {L.customer}
          </div>
          <div className="mt-1 font-medium">{doc.customer.name}</div>
          {doc.customer.legalName &&
          doc.customer.legalName !== doc.customer.name ? (
            <div>{doc.customer.legalName}</div>
          ) : null}
          {doc.unitName ? <div>{doc.unitName}</div> : null}
          {doc.customer.addressLine1 ? (
            <div>{doc.customer.addressLine1}</div>
          ) : null}
          {doc.customer.addressLine2 ? (
            <div>{doc.customer.addressLine2}</div>
          ) : null}
          {doc.customer.zipCode || doc.customer.city ? (
            <div>
              {[doc.customer.zipCode, doc.customer.city]
                .filter(Boolean)
                .join(" ")}
            </div>
          ) : null}
          {doc.customer.cvrNumber ? (
            <div>
              {L.cvrNo} {doc.customer.cvrNumber}
            </div>
          ) : null}
          {doc.contactName ? (
            <div className="mt-1">
              {L.contact} {doc.contactName}
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{L.offerNumber}</dt>
          <dd className="text-right font-mono">{doc.offerNumber}</dd>
          <dt className="text-muted-foreground">{L.issued}</dt>
          <dd className="text-right tabular-nums">
            {formatDate(doc.issuedDate) || "—"}
          </dd>
          <dt className="text-muted-foreground">{L.validUntil}</dt>
          <dd className="text-right tabular-nums">
            {formatDate(doc.expiryDate) || L.noExpiry}
          </dd>
          <dt className="text-muted-foreground">{L.currency}</dt>
          <dd className="text-right">{doc.currency}</dd>
        </dl>
      </div>

      {doc.lines.length === 0 ? (
        <p className="text-sm italic">{L.noLines}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1.5 pr-2 font-medium">{L.lineNo}</th>
              <th className="py-1.5 pr-2 font-medium">{L.description}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{L.qty}</th>
              <th className="py-1.5 pr-2 text-right font-medium">
                {L.unitPrice}
              </th>
              <th className="py-1.5 pr-2 text-right font-medium">{L.vat}</th>
              <th className="py-1.5 text-right font-medium">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.lineNumber} className="border-b align-top">
                <td className="text-muted-foreground py-1.5 pr-2 tabular-nums">
                  {l.lineNumber}
                </td>
                <td className="py-1.5 pr-2">
                  {l.description}
                  {l.colorName ? (
                    <span className="text-muted-foreground"> · {l.colorName}</span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {l.quantity}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatPrice(l.unitPrice, doc.currency)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {l.vatRate} %
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatPrice(l.lineSubtotal, doc.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{L.subtotal}</span>
          <span className="tabular-nums">
            {formatPrice(doc.subtotal, doc.currency)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{L.totalVat}</span>
          <span className="tabular-nums">
            {formatPrice(doc.totalVat, doc.currency)}
          </span>
        </div>
        <div className="flex justify-between border-t-2 border-black pt-1 text-base font-semibold">
          <span>{L.total}</span>
          <span className="tabular-nums">
            {formatPrice(doc.total, doc.currency)}
          </span>
        </div>
      </div>

      <footer className="mt-auto border-t pt-3 text-xs leading-relaxed">
        <div>{L.validityNote}</div>
        <div className="text-muted-foreground mt-1">
          {COMPANY.name} · {COMPANY.email}
        </div>
      </footer>
    </div>
  );
}
