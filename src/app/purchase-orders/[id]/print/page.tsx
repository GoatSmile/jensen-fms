import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PrintButton } from "@/app/parts/print/_components/print-button";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/invoicing/company";
import { loadCommunicationSettings } from "@/lib/communication/settings";
import { PO_LABELS, loadPODocument } from "@/lib/purchasing/po-document";
import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/parts/format";
import { formatQuantity } from "@/lib/parts/stock";

export const dynamic = "force-dynamic";

/**
 * Print-friendly purchase order — the supplier-facing artifact, printed or
 * saved as PDF via the browser (same pattern as the invoice print page).
 * Rendered in the SUPPLIER's document language (`suppliers.document_language`,
 * default English — suppliers span HK/DE/NL/FI/BE/SE); only the print-hidden
 * toolbar follows the UI locale. Shows the supplier's own article numbers where on file and NO
 * internal cost basis (FX/transport/tariff stay ours). Drafts print with a
 * DRAFT watermark. The email-to-supplier action renders the same
 * loadPODocument payload, so paper and mail always match.
 */
export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [doc, comm, t] = await Promise.all([
    loadPODocument(supabase, id),
    loadCommunicationSettings(supabase),
    getTranslations("poDetail"),
  ]);
  if (!doc) notFound();

  const L = PO_LABELS[doc.lang];
  const country = doc.lang === "da" ? COMPANY.countryDa : COMPANY.countryEn;
  const isDraft = doc.status === "draft";
  // COMPANY still carries [placeholders] for some contact fields; prefer the
  // admin-configured communication settings and drop the line when neither
  // side has a real value — a bracketed placeholder must never print.
  const contactEmail =
    comm.replyToEmail ?? (COMPANY.email.includes("[") ? null : COMPANY.email);
  const contactPhone =
    comm.workshopPhone ?? (COMPANY.phone.includes("[") ? null : COMPANY.phone);
  const showSupplierRef = doc.lines.some((l) => l.supplierSku != null);

  return (
    <div className="relative mx-auto flex max-w-3xl flex-col gap-8 p-6 print:max-w-none print:p-0">
      {isDraft ? (
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
            href={`/purchase-orders/${doc.id}`}
            className="underline underline-offset-4"
          >
            {t("printBack")}
          </Link>
          {doc.hasUnpricedLines ? (
            <span className="ml-3 text-money">
              {t("printUnpricedNotice")}
            </span>
          ) : null}
        </div>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{L.title}</h1>
          <div className="font-mono text-sm">{doc.poNumber}</div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <Logo heightClass="h-10" />
          <div className="text-xs leading-relaxed">
            <div className="font-medium">{COMPANY.name}</div>
            {!COMPANY.addressLine1.includes("[") ? (
              <div>{COMPANY.addressLine1}</div>
            ) : null}
            {!COMPANY.zipCity.includes("[") ? (
              <div>
                {COMPANY.zipCity}, {country}
              </div>
            ) : null}
            {contactEmail ? <div>{contactEmail}</div> : null}
            {contactPhone ? <div>{contactPhone}</div> : null}
          </div>
        </div>
      </header>

      <div className="flex items-start justify-between gap-6">
        <div className="text-sm leading-relaxed">
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            {L.supplier}
          </div>
          <div className="mt-1 font-medium">{doc.supplier?.name ?? "—"}</div>
          {doc.supplier?.addressLine1 ? (
            <div>{doc.supplier.addressLine1}</div>
          ) : null}
          {doc.supplier?.addressLine2 ? (
            <div>{doc.supplier.addressLine2}</div>
          ) : null}
          {doc.supplier?.zipCode || doc.supplier?.town ? (
            <div>
              {[doc.supplier?.zipCode, doc.supplier?.town]
                .filter(Boolean)
                .join(" ")}
            </div>
          ) : null}
          {doc.supplier?.country ? <div>{doc.supplier.country}</div> : null}
          {doc.supplier?.emailPrimary ? (
            <div className="font-mono text-xs">
              {doc.supplier.emailPrimary}
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{L.orderDate}</dt>
          <dd className="text-right tabular-nums">
            {formatDate(doc.orderDate)}
          </dd>
          {doc.expectedDate ? (
            <>
              <dt className="text-muted-foreground">{L.requestedDelivery}</dt>
              <dd className="text-right tabular-nums">
                {formatDate(doc.expectedDate)}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{L.lines}</dt>
          <dd className="text-right tabular-nums">{doc.lines.length}</dd>
        </dl>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">{L.item}</th>
            {showSupplierRef ? (
              <th className="py-1.5 pr-2 font-medium">{L.yourRef}</th>
            ) : null}
            <th className="py-1.5 pr-2 text-right font-medium">{L.qty}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{L.unitPrice}</th>
            <th className="py-1.5 text-right font-medium">{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.position} className="border-b align-top">
              <td className="py-1.5 pr-2 tabular-nums">{l.position}</td>
              <td className="py-1.5 pr-2">
                <div>{l.name}</div>
                <div className="text-muted-foreground font-mono text-xs">
                  {l.ourSku}
                </div>
              </td>
              {showSupplierRef ? (
                <td className="py-1.5 pr-2 font-mono text-xs">
                  {l.supplierSku ?? "—"}
                </td>
              ) : null}
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {formatQuantity(l.quantity)}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {l.unitPrice == null ? (
                  <span className="italic">{L.pricePending}</span>
                ) : (
                  formatPrice(l.unitPrice, l.currency)
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {l.lineTotal == null
                  ? "—"
                  : formatPrice(l.lineTotal, l.currency)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {doc.totalsByCurrency.map((tot) => (
            <tr key={tot.currency}>
              <td
                colSpan={showSupplierRef ? 5 : 4}
                className="py-2 pr-2 text-right font-medium"
              >
                {L.total} ({tot.currency})
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {formatPrice(tot.amount, tot.currency)}
              </td>
            </tr>
          ))}
        </tfoot>
      </table>

      {doc.hasUnpricedLines ? (
        <p className="text-muted-foreground text-xs">{L.unpricedNote}</p>
      ) : null}
    </div>
  );
}
