/**
 * The CUSTOMER-facing view of an offer — one loader shared by the print page
 * (/offers/[id]/print) and the email action, so paper and mail can never
 * disagree about what was quoted. Mirrors
 * `src/lib/services/service-order-document.ts`.
 *
 * Renders in the OFFER's language (`offers.language`, defaulted from
 * `organizations.preferred_language`), not the UI locale — a Danish customer
 * reads Danish whatever the shop tablet is set to. Labels live in DOC_LABELS
 * here rather than in `messages/*.json` because per-document language is the
 * invoice-print pattern, and the email renderer is a pure function with no
 * next-intl context.
 *
 * Line descriptions come from `v_offer_lines_localized`, whose
 * `effective_description` already falls back from the per-line override to the
 * part or template name in the document's language.
 *
 * What is NOT here: `offers.notes`. Order notes are internal working notes and
 * never reach the customer — the same doctrine as the PO and paint-order
 * documents, where the send dialog's message is the only free text that
 * travels.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { localizedName } from "@/i18n/vocab";
import { loadOfferLineImages } from "@/lib/offers/line-images";
import {
  asDocumentLanguage,
  type DocumentLanguage,
} from "@/lib/documents/language";

export type { DocumentLanguage } from "@/lib/documents/language";

export type OfferDocumentLabels = {
  title: string;
  offerNumber: string;
  revision: string;
  issued: string;
  validUntil: string;
  noExpiry: string;
  customer: string;
  contact: string;
  currency: string;
  lineNo: string;
  description: string;
  qty: string;
  unitPrice: string;
  vat: string;
  amount: string;
  subtotal: string;
  totalVat: string;
  total: string;
  draftWatermark: string;
  validityNote: string;
  noLines: string;
  cvrNo: string;
};

export const OFFER_DOC_LABELS: Record<DocumentLanguage, OfferDocumentLabels> = {
  da: {
    title: "Tilbud",
    offerNumber: "Tilbudsnr.",
    revision: "Revision",
    issued: "Dato",
    validUntil: "Gyldigt til",
    noExpiry: "—",
    customer: "Tilbud til",
    contact: "Att.",
    currency: "Valuta",
    lineNo: "#",
    description: "Beskrivelse",
    qty: "Antal",
    unitPrice: "Enhedspris",
    vat: "Moms",
    amount: "Beløb",
    subtotal: "Subtotal",
    totalVat: "Moms",
    total: "I alt",
    draftWatermark: "UDKAST",
    validityNote: "Priser er ekskl. moms hvor intet andet er anført.",
    noLines: "Ingen linjer på dette tilbud.",
    cvrNo: "CVR-nr.",
  },
  en: {
    title: "Offer",
    offerNumber: "Offer no.",
    revision: "Revision",
    issued: "Date",
    validUntil: "Valid until",
    noExpiry: "—",
    customer: "Offer to",
    contact: "Attn.",
    currency: "Currency",
    lineNo: "#",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit price",
    vat: "VAT",
    amount: "Amount",
    subtotal: "Subtotal",
    totalVat: "VAT",
    total: "Total",
    draftWatermark: "DRAFT",
    validityNote: "Prices exclude VAT unless stated otherwise.",
    noLines: "This offer has no lines.",
    cvrNo: "CVR no.",
  },
};

export type OfferDocumentLine = {
  lineNumber: number;
  /** The picture attached to this line, if any. Frozen into the snapshot with
   *  everything else, so a later removal cannot blank a document already sent —
   *  which is why removing one only soft-deletes the row. */
  imageUrl: string | null;
  description: string;
  colorName: string | null;
  quantity: number;
  unitPrice: number | null;
  vatRate: number;
  lineSubtotal: number;
  lineTotal: number;
};

export type OfferDocument = {
  id: string;
  offerNumber: string;
  revision: number;
  status: string;
  isDraft: boolean;
  language: DocumentLanguage;
  labels: OfferDocumentLabels;
  issuedDate: string | null;
  expiryDate: string | null;
  currency: string;
  subtotal: number | null;
  totalVat: number | null;
  total: number | null;
  customer: {
    name: string;
    legalName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    zipCode: string | null;
    city: string | null;
    cvrNumber: string | null;
  };
  unitName: string | null;
  contactName: string | null;
  lines: OfferDocumentLine[];
};

export async function loadOfferDocument(
  supabase: SupabaseClient<Database>,
  offerId: string,
): Promise<OfferDocument | null> {
  const { data: offer } = await supabase
    .from("offers")
    .select(
      `id, offer_number, revision, status, language, issued_date, expiry_date,
       currency, subtotal_amount, total_vat_amount, total_amount,
       organization:organizations!organization_id(
         legal_name, display_name_en, display_name_da,
         address_line1, address_line2, zip_code, city, cvr_number
       ),
       organization_unit:organization_units!organization_unit_id(name),
       contact:contacts!contact_id(first_name, last_name, role)`,
    )
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return null;

  const language = asDocumentLanguage(offer.language);
  const da = language === "da";

  const { data: lineRows } = await supabase
    .from("v_offer_lines_localized")
    .select(
      "id, line_number, effective_description, color_id, quantity, unit_price, vat_rate, line_subtotal, line_total",
    )
    .eq("offer_id", offerId)
    .order("line_number", { ascending: true });

  // Colour is part of what the customer is buying, and the localized view
  // carries only the id — so resolve the names in one extra read rather than
  // duplicating the view's description logic here.
  const colorIds = Array.from(
    new Set((lineRows ?? []).map((l) => l.color_id).filter(Boolean)),
  ) as string[];
  const colorNames = new Map<string, string>();
  if (colorIds.length > 0) {
    const { data: colors } = await supabase
      .from("colors")
      .select("id, name_en, name_da")
      .in("id", colorIds);
    for (const c of colors ?? []) {
      colorNames.set(c.id, localizedName(language, c.name_en, c.name_da));
    }
  }

  const imagesByLine = await loadOfferLineImages(
    supabase,
    (lineRows ?? []).map((l) => l.id).filter((v): v is string => Boolean(v)),
  );

  const org = offer.organization;
  const customerName =
    (da
      ? (org?.display_name_da ?? org?.display_name_en)
      : (org?.display_name_en ?? org?.display_name_da)) ??
    org?.legal_name ??
    "—";

  const contact = offer.contact;
  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
      null
    : null;

  return {
    id: offer.id,
    offerNumber: offer.offer_number,
    revision: Number(offer.revision ?? 1),
    status: offer.status,
    isDraft: offer.status === "draft",
    language,
    labels: OFFER_DOC_LABELS[language],
    issuedDate: offer.issued_date,
    expiryDate: offer.expiry_date,
    currency: offer.currency,
    subtotal: offer.subtotal_amount != null ? Number(offer.subtotal_amount) : null,
    totalVat:
      offer.total_vat_amount != null ? Number(offer.total_vat_amount) : null,
    total: offer.total_amount != null ? Number(offer.total_amount) : null,
    customer: {
      name: customerName,
      legalName: org?.legal_name ?? null,
      addressLine1: org?.address_line1 ?? null,
      addressLine2: org?.address_line2 ?? null,
      zipCode: org?.zip_code ?? null,
      city: org?.city ?? null,
      cvrNumber: org?.cvr_number ?? null,
    },
    unitName: offer.organization_unit?.name ?? null,
    contactName,
    lines: (lineRows ?? []).map((l) => ({
      lineNumber: Number(l.line_number),
      imageUrl: l.id ? (imagesByLine[l.id] ?? null) : null,
      description: l.effective_description ?? "—",
      colorName: l.color_id ? (colorNames.get(l.color_id) ?? null) : null,
      quantity: Number(l.quantity),
      unitPrice: l.unit_price != null ? Number(l.unit_price) : null,
      vatRate: Number(l.vat_rate ?? 0),
      lineSubtotal: Number(l.line_subtotal ?? 0),
      lineTotal: Number(l.line_total ?? 0),
    })),
  };
}


/**
 * Freeze the document as it stands, against the offer's current revision.
 *
 * Called by `markOfferSent` — the one function BOTH send doors go through — so
 * printing-and-handing-over is recorded exactly as emailing is. Before this,
 * only the emailed path left a trace (`outbound_messages.body_html`), and an
 * offer printed then reopened for revision lost what revision 1 said.
 *
 * The whole document is stored, labels included, so later edits to wording or
 * price cannot rewrite what the customer was handed.
 *
 * A failed write does NOT fail the send: the customer is about to be holding
 * this document either way, and refusing the transition would leave the offer
 * reading `draft` while the paper says otherwise. Same rule as the outbox —
 * the business action outranks its own bookkeeping — so it is logged loudly
 * and the send proceeds.
 */
export async function writeOfferRevisionSnapshot(
  supabase: SupabaseClient<Database>,
  offerId: string,
  sentBy: string | null,
): Promise<void> {
  const doc = await loadOfferDocument(supabase, offerId);
  if (!doc) {
    console.error(`[offer-snapshot] ${offerId}: document would not load`);
    return;
  }
  const { error } = await supabase.from("offer_revisions").insert({
    offer_id: offerId,
    revision: doc.revision,
    issued_date: doc.issuedDate ?? new Date().toISOString().slice(0, 10),
    expiry_date: doc.expiryDate,
    sent_by: sentBy,
    document: doc as unknown as Database["public"]["Tables"]["offer_revisions"]["Insert"]["document"],
  });
  if (error) {
    console.error(
      `[offer-snapshot] ${offerId} rev ${doc.revision}: ${error.message}`,
    );
  }
}

/**
 * The document AS ISSUED, for anything a customer sees.
 *
 * Past draft this returns the snapshot taken at send — what they were actually
 * handed — rather than a re-render of today's data. A draft has nothing to
 * freeze yet, so it renders live and prints with its watermark.
 *
 * `fromSnapshot: false` on a sent offer means no snapshot exists: an offer sent
 * before migration 99, or one whose snapshot write failed. Rendering live is
 * the honest fallback, and it is the only case where a later edit can still
 * rewrite what "was sent".
 */
export async function loadIssuedOfferDocument(
  supabase: SupabaseClient<Database>,
  offerId: string,
): Promise<{ doc: OfferDocument | null; fromSnapshot: boolean }> {
  const { data: offer } = await supabase
    .from("offers")
    .select("status, revision")
    .eq("id", offerId)
    .maybeSingle();

  if (offer && offer.status !== "draft") {
    const { data: snap } = await supabase
      .from("offer_revisions")
      .select("document")
      .eq("offer_id", offerId)
      .eq("revision", Number(offer.revision ?? 1))
      .maybeSingle();
    if (snap?.document) {
      return {
        doc: snap.document as unknown as OfferDocument,
        fromSnapshot: true,
      };
    }
  }

  return { doc: await loadOfferDocument(supabase, offerId), fromSnapshot: false };
}
