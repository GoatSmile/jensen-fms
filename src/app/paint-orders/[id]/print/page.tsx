import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PrintButton } from "@/app/parts/print/_components/print-button";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/invoicing/company";
import { loadCommunicationSettings } from "@/lib/communication/settings";
import {
  DOC_LABELS,
  loadServiceOrderDocument,
} from "@/lib/services/service-order-document";
import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/parts/format";

export const dynamic = "force-dynamic";

/**
 * Print-friendly paint order — the painter-facing artefact, printed or saved
 * as PDF via the browser (same pattern as the PO and invoice print pages).
 * Renders in the SUPPLIER's document language, not the UI locale: only the
 * print-hidden toolbar (back link, notices) follows the person at the
 * keyboard. Shows the painter's own item numbers where the price list has
 * them and NO internal notes. A `planned` order prints with a DRAFT watermark
 * and live estimates; a sent one prints the frozen prices. The
 * email-to-painter action renders the same loadServiceOrderDocument payload,
 * so paper and mail always match.
 */
export default async function PaintOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [doc, comm, t] = await Promise.all([
    loadServiceOrderDocument(supabase, id),
    loadCommunicationSettings(supabase),
    getTranslations("paintOrderDetail"),
  ]);
  if (!doc) notFound();

  const L = DOC_LABELS[doc.lang];
  const isPlanned = doc.status === "planned";
  // COMPANY still carries [placeholders] for some contact fields; prefer the
  // admin-configured communication settings and drop the line when neither
  // side has a real value — a bracketed placeholder must never print.
  const contactEmail =
    comm.replyToEmail ?? (COMPANY.email.includes("[") ? null : COMPANY.email);
  const contactPhone =
    comm.workshopPhone ?? (COMPANY.phone.includes("[") ? null : COMPANY.phone);
  const showItemNo = doc.lines.some((l) => l.supplierItemNo != null);
  const country = doc.lang === "da" ? COMPANY.countryDa : COMPANY.countryEn;

  return (
    <div className="relative mx-auto flex max-w-3xl flex-col gap-8 p-6 print:max-w-none print:p-0">
      {isPlanned ? (
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
            href={`/paint-orders/${doc.id}`}
            className="underline underline-offset-4"
          >
            {t("printBack")}
          </Link>
          {doc.hasUnpricedLines ? (
            <span className="ml-3 text-money">{t("printUnpricedNotice")}</span>
          ) : null}
        </div>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
          <div className="font-mono text-sm">{doc.orderNumber}</div>
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
            <div className="font-mono text-xs">{doc.supplier.emailPrimary}</div>
          ) : null}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
          {doc.salesOrderNumber ? (
            <>
              <dt className="text-muted-foreground">{L.ourRef}</dt>
              <dd className="text-right font-mono">{doc.salesOrderNumber}</dd>
            </>
          ) : null}
          {doc.batchColour ? (
            <>
              <dt className="text-muted-foreground">{L.batchColour}</dt>
              <dd className="text-right">
                {doc.batchColour}
                {doc.batchColourFinish ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {doc.batchColourFinish}
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
          {doc.plannedSendDate ? (
            <>
              <dt className="text-muted-foreground">{L.plannedSend}</dt>
              <dd className="text-right tabular-nums">
                {formatDate(doc.plannedSendDate)}
              </dd>
            </>
          ) : null}
          {doc.sentAt ? (
            <>
              <dt className="text-muted-foreground">{L.sent}</dt>
              <dd className="text-right tabular-nums">{formatDate(doc.sentAt)}</dd>
            </>
          ) : null}
          {doc.expectedReturnAt ? (
            <>
              <dt className="text-muted-foreground">{L.expectedReturn}</dt>
              <dd className="text-right tabular-nums">
                {formatDate(doc.expectedReturnAt)}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">{L.item}</th>
            {showItemNo ? (
              <th className="py-1.5 pr-2 font-medium">{L.yourItemNo}</th>
            ) : null}
            <th className="py-1.5 pr-2 font-medium">{L.colour}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{L.qty}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{L.unitPrice}</th>
            <th className="py-1.5 text-right font-medium">{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.position} className="border-b align-top">
              <td className="py-1.5 pr-2 tabular-nums">{l.position}</td>
              <td className="py-1.5 pr-2">{l.partType}</td>
              {showItemNo ? (
                <td className="py-1.5 pr-2 font-mono text-xs">
                  {l.supplierItemNo ?? "—"}
                </td>
              ) : null}
              <td className="py-1.5 pr-2">
                <div>{l.colour ?? "—"}</div>
                {l.colourFinish ? (
                  <div className="text-muted-foreground text-xs">
                    {l.colourFinish}
                  </div>
                ) : null}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {l.quantity}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {l.unitPrice == null || !l.currency ? (
                  <span className="italic">{L.pricePending}</span>
                ) : (
                  formatPrice(l.unitPrice, l.currency)
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {l.lineTotal == null || !l.currency
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
                colSpan={showItemNo ? 6 : 5}
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

      {doc.priceListName ? (
        <p className="text-muted-foreground -mt-4 text-xs">
          {L.pricesPerList.replace("{list}", doc.priceListName)}
        </p>
      ) : null}
      {doc.hasUnpricedLines ? (
        <p className="text-muted-foreground -mt-4 text-xs">{L.unpricedNote}</p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          {L.frames}
          {doc.bikes.length > 0 ? ` (${doc.bikes.length})` : ""}
        </h2>
        {doc.bikes.length === 0 ? (
          <p className="text-muted-foreground text-xs">{L.noFrames}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-1.5 pr-2 font-medium">{L.frameNumber}</th>
                <th className="py-1.5 font-medium">{L.model}</th>
              </tr>
            </thead>
            <tbody>
              {doc.bikes.map((b) => (
                <tr key={b.frameNumber} className="border-b">
                  <td className="py-1.5 pr-2 font-mono">{b.frameNumber}</td>
                  <td className="py-1.5">{b.templateLabel ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
