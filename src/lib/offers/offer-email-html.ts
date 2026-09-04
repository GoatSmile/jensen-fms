/**
 * Render an OfferDocument as email-safe HTML (inline styles, plain tables).
 * Same payload as the print page, so paper and mail always match, and the same
 * DOC_LABELS in the CUSTOMER's language.
 *
 * Pure string building — every dynamic value goes through escapeHtml,
 * including the sender-written message. The TEST banner stays English: it is
 * for our own inbox, never the customer's.
 */

import { formatPrice } from "@/lib/format";
import { OFFER_DOC_LABELS, type OfferDocument } from "./offer-document";

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

export function renderOfferEmailHtml(
  doc: OfferDocument,
  opts: {
    companyName: string;
    contactEmail: string | null;
    /** Optional sender-written message shown above the offer table. */
    message: string | null;
    testMode: boolean;
    intended: string[];
  },
): string {
  const L = OFFER_DOC_LABELS[doc.language];

  const testBanner = opts.testMode
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:13px;">
         <strong>TEST</strong> — outbound test mode is on. This email would have gone to:
         ${escapeHtml(opts.intended.length > 0 ? opts.intended.join(", ") : "(no customer email on file)")}
       </div>`
    : "";

  const messageBlock = opts.message
    ? `<p style="white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(opts.message)}</p>`
    : "";

  const metaRow = (label: string, value: string | null) =>
    value
      ? `<tr><td style="${mutedCell}">${escapeHtml(label)}</td><td style="padding:2px 0;text-align:right;">${escapeHtml(value)}</td></tr>`
      : "";

  const lineRows = doc.lines
    .map(
      (l) => `<tr>
        <td style="${cellStyle}color:#737373;">${l.lineNumber}</td>
        <td style="${cellStyle}">${escapeHtml(l.description)}${
          l.colorName
            ? ` <span style="color:#737373;">· ${escapeHtml(l.colorName)}</span>`
            : ""
        }</td>
        <td style="${rightCell}">${l.quantity}</td>
        <td style="${rightCell}">${escapeHtml(formatPrice(l.unitPrice, doc.currency))}</td>
        <td style="${rightCell}">${l.vatRate} %</td>
        <td style="${rightCell}">${escapeHtml(formatPrice(l.lineSubtotal, doc.currency))}</td>
      </tr>`,
    )
    .join("");

  const totalRow = (label: string, value: number | null, bold = false) =>
    `<tr>
       <td style="padding:2px 0;color:#737373;">${escapeHtml(label)}</td>
       <td style="padding:2px 0;text-align:right;${bold ? "font-weight:600;" : ""}">${escapeHtml(
         formatPrice(value, doc.currency),
       )}</td>
     </tr>`;

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;color:#171717;max-width:640px;">
  ${testBanner}
  <h1 style="font-size:20px;margin:0 0 4px;">${escapeHtml(L.title)} ${escapeHtml(doc.offerNumber)}${
    doc.revision > 1 ? ` <span style="color:#737373;font-weight:400;">· ${escapeHtml(L.revision)} ${doc.revision}</span>` : ""
  }</h1>
  <p style="margin:0 0 16px;color:#737373;">${escapeHtml(doc.customer.name)}</p>

  ${messageBlock}

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
    ${metaRow(L.issued, doc.issuedDate)}
    ${metaRow(L.validUntil, doc.expiryDate ?? L.noExpiry)}
    ${metaRow(L.currency, doc.currency)}
  </table>

  ${
    doc.lines.length === 0
      ? `<p style="font-style:italic;">${escapeHtml(L.noLines)}</p>`
      : `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="text-align:left;border-bottom:2px solid #171717;">
        <th style="padding:6px 8px;">${escapeHtml(L.lineNo)}</th>
        <th style="padding:6px 8px;">${escapeHtml(L.description)}</th>
        <th style="padding:6px 8px;text-align:right;">${escapeHtml(L.qty)}</th>
        <th style="padding:6px 8px;text-align:right;">${escapeHtml(L.unitPrice)}</th>
        <th style="padding:6px 8px;text-align:right;">${escapeHtml(L.vat)}</th>
        <th style="padding:6px 8px;text-align:right;">${escapeHtml(L.amount)}</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>`
  }

  <table style="margin:16px 0 0 auto;font-size:13px;min-width:220px;">
    ${totalRow(L.subtotal, doc.subtotal)}
    ${totalRow(L.totalVat, doc.totalVat)}
    ${totalRow(L.total, doc.total, true)}
  </table>

  <p style="margin:24px 0 0;font-size:12px;color:#737373;">${escapeHtml(L.validityNote)}</p>
  <p style="margin:4px 0 0;font-size:12px;color:#737373;">${escapeHtml(opts.companyName)}${
    opts.contactEmail ? ` · ${escapeHtml(opts.contactEmail)}` : ""
  }</p>
</div>`;
}
