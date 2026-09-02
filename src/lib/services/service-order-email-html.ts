/**
 * Render a ServiceOrderDocument as email-safe HTML (inline styles, plain
 * tables) for the email-to-painter action. Same payload as the print page,
 * so paper and mail always match; same labels (DOC_LABELS) in the supplier's
 * language. Pure string building — every dynamic value goes through
 * escapeHtml, including the sender-written message. The TEST banner stays
 * English: it is for our own inbox, never the supplier's.
 */

import { formatPrice } from "@/lib/format";
import { DOC_LABELS, type ServiceOrderDocument } from "./service-order-document";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const cellStyle = "padding:6px 8px;border-bottom:1px solid #e5e5e5;";
const rightCell = `${cellStyle}text-align:right;white-space:nowrap;`;
const mutedCell = "padding:2px 0;color:#737373;";

export function renderServiceOrderEmailHtml(
  doc: ServiceOrderDocument,
  opts: {
    companyName: string;
    contactEmail: string | null;
    /** Optional sender-written message shown above the order table. */
    message: string | null;
    /** Test-mode banner: who the mail was really meant for. */
    testMode: boolean;
    intended: string[];
  },
): string {
  const L = DOC_LABELS[doc.lang];
  const showRef = doc.lines.some((l) => l.supplierItemNo != null);

  const testBanner = opts.testMode
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:13px;">
         <strong>TEST</strong> — outbound test mode is on. This email would have gone to:
         ${escapeHtml(opts.intended.length > 0 ? opts.intended.join(", ") : "(no supplier email on file)")}
       </div>`
    : "";

  const messageBlock = opts.message
    ? `<p style="white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(opts.message)}</p>`
    : "";

  const metaRow = (label: string, value: string | null) =>
    value
      ? `<tr><td style="${mutedCell}">${escapeHtml(label)}</td><td style="padding:2px 0;text-align:right;">${escapeHtml(value)}</td></tr>`
      : "";

  const framesBlock =
    doc.bikes.length > 0
      ? `<h2 style="font-size:14px;margin:20px 0 6px;">${escapeHtml(L.frames)} (${doc.bikes.length})</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="border-bottom:2px solid #171717;text-align:left;">
        <th style="padding:6px 8px;">${escapeHtml(L.frameNumber)}</th>
        <th style="padding:6px 8px;">${escapeHtml(L.model)}</th>
      </tr></thead>
      <tbody>${doc.bikes
        .map(
          (b) => `<tr>
        <td style="${cellStyle}font-family:monospace;">${escapeHtml(b.frameNumber)}</td>
        <td style="${cellStyle}">${escapeHtml(b.templateLabel ?? "—")}</td>
      </tr>`,
        )
        .join("")}</tbody>
    </table>`
      : "";

  const rows = doc.lines
    .map(
      (l) => `<tr>
        <td style="${cellStyle}">${l.position}</td>
        <td style="${cellStyle}">${escapeHtml(l.partType)}</td>
        ${showRef ? `<td style="${cellStyle}font-family:monospace;font-size:12px;">${escapeHtml(l.supplierItemNo ?? "—")}</td>` : ""}
        <td style="${cellStyle}">${escapeHtml(l.colour ?? "—")}${
          l.colourFinish
            ? `<br/><span style="color:#737373;font-size:12px;">${escapeHtml(l.colourFinish)}</span>`
            : ""
        }</td>
        <td style="${rightCell}">${l.quantity}</td>
        <td style="${rightCell}">${
          l.unitPrice == null || !l.currency
            ? `<em>${escapeHtml(L.pricePending)}</em>`
            : escapeHtml(formatPrice(l.unitPrice, l.currency))
        }</td>
        <td style="${rightCell}">${
          l.lineTotal == null || !l.currency
            ? "—"
            : escapeHtml(formatPrice(l.lineTotal, l.currency))
        }</td>
      </tr>`,
    )
    .join("");

  const totals = doc.totalsByCurrency
    .map(
      (t) => `<tr>
        <td colspan="${showRef ? 6 : 5}" style="padding:8px;text-align:right;font-weight:600;">${escapeHtml(L.total)} (${escapeHtml(t.currency)})</td>
        <td style="padding:8px;text-align:right;font-weight:600;white-space:nowrap;">${escapeHtml(formatPrice(t.amount, t.currency))}</td>
      </tr>`,
    )
    .join("");

  const priceNotes = [
    doc.priceListName
      ? L.pricesPerList.replace("{list}", doc.priceListName)
      : null,
    doc.hasUnpricedLines ? L.unpricedNote : null,
  ]
    .filter((s): s is string => Boolean(s))
    .map(
      (s) =>
        `<p style="color:#737373;font-size:12px;margin:8px 0 0;">${escapeHtml(s)}</p>`,
    )
    .join("");

  return `<!doctype html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;color:#171717;font-size:14px;line-height:1.5;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;">
    ${testBanner}
    <h1 style="font-size:20px;margin:0 0 2px;">${escapeHtml(doc.title)}</h1>
    <div style="font-family:monospace;font-size:14px;margin-bottom:16px;">${escapeHtml(doc.orderNumber)}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;">
      ${metaRow(L.supplier, doc.supplier?.name ?? null)}
      ${metaRow(L.ourRef, doc.salesOrderNumber)}
      ${metaRow(
        L.batchColour,
        doc.batchColour
          ? `${doc.batchColour}${doc.batchColourFinish ? ` · ${doc.batchColourFinish}` : ""}`
          : null,
      )}
      ${metaRow(L.plannedSend, doc.plannedSendDate)}
      ${metaRow(L.expectedReturn, doc.expectedReturnAt?.slice(0, 10) ?? null)}
    </table>
    ${messageBlock}
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #171717;text-align:left;">
          <th style="padding:6px 8px;">#</th>
          <th style="padding:6px 8px;">${escapeHtml(L.item)}</th>
          ${showRef ? `<th style="padding:6px 8px;">${escapeHtml(L.yourItemNo)}</th>` : ""}
          <th style="padding:6px 8px;">${escapeHtml(L.colour)}</th>
          <th style="padding:6px 8px;text-align:right;">${escapeHtml(L.qty)}</th>
          <th style="padding:6px 8px;text-align:right;">${escapeHtml(L.unitPrice)}</th>
          <th style="padding:6px 8px;text-align:right;">${escapeHtml(L.amount)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>${totals}</tfoot>
    </table>
    ${priceNotes}
    ${framesBlock}
    <p style="color:#737373;font-size:12px;margin-top:24px;">
      ${escapeHtml(opts.companyName)}${opts.contactEmail ? ` · ${escapeHtml(opts.contactEmail)}` : ""}
    </p>
  </div>
</body>
</html>`;
}
