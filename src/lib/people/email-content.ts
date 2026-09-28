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

/**
 * A sales order is built and ready (its last MO completed). To Dennis, who
 * decides whether the customer collects or Finn delivers (15 Sep, 02:07).
 */
export function soReadyEmail(
  lang: "da" | "en",
  input: {
    soNumber: string;
    customer: string | null;
    bikeCount: number;
    url: string;
  },
): EmailContent {
  const customer = input.customer ? escapeHtml(input.customer) : "—";
  if (lang === "da") {
    return {
      subject: `Ordre ${input.soNumber} er klar til levering`,
      html:
        `<p>Salgsordren <strong>${escapeHtml(input.soNumber)}</strong> til <strong>${customer}</strong> er færdigbygget og klar.</p>` +
        `<p>Cykler: ${input.bikeCount}. Skal kunden hente, eller skal Finn levere?</p>` +
        link(input.url, "Åbn ordren"),
    };
  }
  return {
    subject: `Order ${input.soNumber} is ready for delivery`,
    html:
      `<p>Sales order <strong>${escapeHtml(input.soNumber)}</strong> for <strong>${customer}</strong> is built and ready.</p>` +
      `<p>Bikes: ${input.bikeCount}. Will the customer collect, or does Finn deliver?</p>` +
      link(input.url, "Open the order"),
  };
}

/**
 * A paint order came back (Finn collected it on the floor) with lines that
 * could not become painted stock — they name no part or colour. To Dennis,
 * who can fix the lines and record the stock.
 */
export function paintReceivedIncompleteEmail(
  lang: "da" | "en",
  input: { orderNumber: string; skipped: number; failed: number; url: string },
): EmailContent {
  const n = input.skipped + input.failed;
  if (lang === "da") {
    return {
      subject: `Lakordre ${input.orderNumber} er hentet — ${n} linje(r) mangler`,
      html:
        `<p>Lakordren <strong>${escapeHtml(input.orderNumber)}</strong> er hentet og modtaget retur.</p>` +
        `<p>${n} linje(r) kunne ikke blive til lakeret lager, fordi de ikke nævner en del og en farve. Ret linjerne, og registrér lageret.</p>` +
        link(input.url, "Åbn lakordren"),
    };
  }
  return {
    subject: `Paint order ${input.orderNumber} collected — ${n} line(s) need attention`,
    html:
      `<p>Paint order <strong>${escapeHtml(input.orderNumber)}</strong> was collected and received back.</p>` +
      `<p>${n} line(s) could not become painted stock because they name no part and colour. Fix the lines and record the stock.</p>` +
      link(input.url, "Open the paint order"),
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
