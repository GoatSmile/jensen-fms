/**
 * Render a PODocument as email-safe HTML (inline styles, plain tables) for
 * the email-to-supplier action. Same payload as the print page, so paper
 * and mail always match. Pure string building — every dynamic value goes
 * through escapeHtml, including the sender-written message.
 */

import { formatPrice } from "@/lib/format";
import type { PODocument } from "./po-document";

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

export function renderPOEmailHtml(
  doc: PODocument,
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
  const showRef = doc.lines.some((l) => l.supplierSku != null);

  const testBanner = opts.testMode
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:13px;">
         <strong>TEST</strong> — outbound test mode is on. This email would have gone to:
         ${escapeHtml(opts.intended.length > 0 ? opts.intended.join(", ") : "(no supplier email on file)")}
       </div>`
    : "";

  const messageBlock = opts.message
    ? `<p style="white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(opts.message)}</p>`
    : "";

  const rows = doc.lines
    .map(
      (l) => `<tr>
        <td style="${cellStyle}">${l.position}</td>
        <td style="${cellStyle}">${escapeHtml(l.name)}<br/>
          <span style="color:#737373;font-family:monospace;font-size:12px;">${escapeHtml(l.ourSku)}</span></td>
        ${showRef ? `<td style="${cellStyle}font-family:monospace;font-size:12px;">${escapeHtml(l.supplierSku ?? "—")}</td>` : ""}
        <td style="${rightCell}">${l.quantity}</td>
        <td style="${rightCell}">${l.unitPrice == null ? "<em>price pending</em>" : escapeHtml(formatPrice(l.unitPrice, l.currency))}</td>
        <td style="${rightCell}">${l.lineTotal == null ? "—" : escapeHtml(formatPrice(l.lineTotal, l.currency))}</td>
      </tr>`,
    )
    .join("");

  const totals = doc.totalsByCurrency
    .map(
      (t) => `<tr>
        <td colspan="${showRef ? 5 : 4}" style="padding:8px;text-align:right;font-weight:600;">Total (${escapeHtml(t.currency)})</td>
        <td style="padding:8px;text-align:right;font-weight:600;white-space:nowrap;">${escapeHtml(formatPrice(t.amount, t.currency))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;color:#171717;font-size:14px;line-height:1.5;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;">
    ${testBanner}
    <h1 style="font-size:20px;margin:0 0 2px;">Purchase order</h1>
    <div style="font-family:monospace;font-size:14px;margin-bottom:16px;">${escapeHtml(doc.poNumber)}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;">
      <tr>
        <td style="padding:2px 0;color:#737373;">Supplier</td>
        <td style="padding:2px 0;text-align:right;">${escapeHtml(doc.supplier?.name ?? "—")}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;color:#737373;">Order date</td>
        <td style="padding:2px 0;text-align:right;">${escapeHtml(doc.orderDate ?? "—")}</td>
      </tr>
      ${
        doc.expectedDate
          ? `<tr>
        <td style="padding:2px 0;color:#737373;">Requested delivery</td>
        <td style="padding:2px 0;text-align:right;">${escapeHtml(doc.expectedDate)}</td>
      </tr>`
          : ""
      }
    </table>
    ${messageBlock}
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #171717;text-align:left;">
          <th style="padding:6px 8px;">#</th>
          <th style="padding:6px 8px;">Item</th>
          ${showRef ? `<th style="padding:6px 8px;">Your ref.</th>` : ""}
          <th style="padding:6px 8px;text-align:right;">Qty</th>
          <th style="padding:6px 8px;text-align:right;">Unit price</th>
          <th style="padding:6px 8px;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>${totals}</tfoot>
    </table>
    ${
      doc.hasUnpricedLines
        ? `<p style="color:#737373;font-size:12px;">Lines marked “price pending” await your quotation — please confirm prices on the order confirmation.</p>`
        : ""
    }
    <p style="color:#737373;font-size:12px;margin-top:24px;">
      ${escapeHtml(opts.companyName)}${opts.contactEmail ? ` · ${escapeHtml(opts.contactEmail)}` : ""}
    </p>
  </div>
</body>
</html>`;
}
