/**
 * Bilingual email bodies for the notification events (people & roles P4).
 * Deliberately plain HTML — these are short operational pings, not
 * documents; the entity link is the payload. Each builder returns the
 * recipient's language (the engine picks per person.preferred_language).
 */
import { formatPrice } from "@/lib/format";

import { escapeHtml, type EmailContent } from "./notify";

function link(url: string, label: string): string {
  return `<p><a href="${url}">${escapeHtml(label)}</a></p>`;
}

export function ticketCreatedEmail(
  lang: "da" | "en",
  input: { ticketNumber: string; description: string | null; url: string },
): EmailContent {
  const desc = input.description?.trim()
    ? `<p>${escapeHtml(input.description.trim().slice(0, 300))}</p>`
    : "";
  if (lang === "da") {
    return {
      subject: `Ny sag ${input.ticketNumber}`,
      html:
        `<p>Der er oprettet en ny sag: <strong>${escapeHtml(input.ticketNumber)}</strong></p>` +
        desc +
        link(input.url, "Åbn sagen"),
    };
  }
  return {
    subject: `New ticket ${input.ticketNumber}`,
    html:
      `<p>A new maintenance ticket was created: <strong>${escapeHtml(input.ticketNumber)}</strong></p>` +
      desc +
      link(input.url, "Open the ticket"),
  };
}

export function woAssignedEmail(
  lang: "da" | "en",
  input: { woNumber: string; frameNumber: string | null; url: string },
): EmailContent {
  const frame = input.frameNumber
    ? `<p>${lang === "da" ? "Stelnummer" : "Frame number"}: <strong>${escapeHtml(input.frameNumber)}</strong></p>`
    : "";
  if (lang === "da") {
    return {
      subject: `Arbejdsordre ${input.woNumber} er tildelt dig`,
      html:
        `<p>Arbejdsordren <strong>${escapeHtml(input.woNumber)}</strong> er tildelt dig.</p>` +
        frame +
        link(input.url, "Åbn arbejdsordren"),
    };
  }
  return {
    subject: `Work order ${input.woNumber} assigned to you`,
    html:
      `<p>Work order <strong>${escapeHtml(input.woNumber)}</strong> was assigned to you.</p>` +
      frame +
      link(input.url, "Open the work order"),
  };
}

export type OverdueInvoiceRow = {
  invoiceNumber: string;
  orgName: string | null;
  amount: number;
  currency: string;
  daysLate: number;
};

export function overdueInvoicesEmail(
  lang: "da" | "en",
  input: { rows: OverdueInvoiceRow[]; url: string },
): EmailContent {
  const n = input.rows.length;
  const items = input.rows
    .map((r) => {
      const parts = [
        `<strong>${escapeHtml(r.invoiceNumber)}</strong>`,
        r.orgName ? escapeHtml(r.orgName) : null,
        escapeHtml(formatPrice(r.amount, r.currency)),
        lang === "da"
          ? `${r.daysLate} dage over forfald`
          : `${r.daysLate} days overdue`,
      ].filter(Boolean);
      return `<li>${parts.join(" · ")}</li>`;
    })
    .join("");
  if (lang === "da") {
    return {
      subject:
        n === 1 ? "1 forfalden faktura" : `${n} forfaldne fakturaer`,
      html:
        `<p>${n === 1 ? "Én faktura er" : `${n} fakturaer er`} over forfaldsdatoen:</p>` +
        `<ul>${items}</ul>` +
        link(input.url, "Åbn fakturaerne"),
    };
  }
  return {
    subject: n === 1 ? "1 overdue invoice" : `${n} overdue invoices`,
    html:
      `<p>${n === 1 ? "One invoice is" : `${n} invoices are`} past their due date:</p>` +
      `<ul>${items}</ul>` +
      link(input.url, "Open invoices"),
  };
}
