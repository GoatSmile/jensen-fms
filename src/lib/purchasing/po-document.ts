/**
 * The supplier-facing view of a purchase order — one loader shared by the
 * print page (/purchase-orders/[id]/print) and the email-to-supplier action,
 * so paper and mail can never disagree about what was ordered.
 *
 * Renders in the SUPPLIER's document language (`suppliers.document_language`,
 * default English — suppliers span HK/DE/NL/FI/BE/SE, and a Danish one reads
 * Danish); labels live in PO_LABELS below, the same shape as the paint
 * document's DOC_LABELS, because the email renderer has no next-intl context.
 *
 * Deliberately EXCLUDES the internal cost basis (FX, transport %, tariff,
 * anti-dumping, landed DKK) AND all notes fields: PO/line notes are internal
 * working notes (machine-drafted lines carry "set price before placing",
 * "origin unclassified…") and must never leak to a supplier. A message to
 * the supplier is written explicitly in the send dialog instead. Lines show
 * the supplier's own article number (their reference) where an offering has
 * one on file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { countryName } from "@/lib/countries";
import {
  asDocumentLanguage,
  type DocumentLanguage,
} from "@/lib/documents/language";

export type PODocumentLabels = {
  title: string;
  supplier: string;
  orderDate: string;
  requestedDelivery: string;
  lines: string;
  item: string;
  yourRef: string;
  qty: string;
  unitPrice: string;
  amount: string;
  total: string;
  pricePending: string;
  unpricedNote: string;
  draftWatermark: string;
};

export const PO_LABELS: Record<DocumentLanguage, PODocumentLabels> = {
  en: {
    title: "Purchase order",
    supplier: "Supplier",
    orderDate: "Order date",
    requestedDelivery: "Requested delivery",
    lines: "Lines",
    item: "Item",
    yourRef: "Your ref.",
    qty: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    total: "Total",
    pricePending: "price pending",
    unpricedNote:
      "Lines marked “price pending” await your quotation — please confirm prices on the order confirmation.",
    draftWatermark: "DRAFT",
  },
  da: {
    title: "Indkøbsordre",
    supplier: "Leverandør",
    orderDate: "Ordredato",
    requestedDelivery: "Ønsket levering",
    lines: "Linjer",
    item: "Vare",
    yourRef: "Jeres varenr.",
    qty: "Antal",
    unitPrice: "Stykpris",
    amount: "Beløb",
    total: "I alt",
    pricePending: "pris afventer",
    unpricedNote:
      "Linjer markeret “pris afventer” afventer jeres tilbud — bekræft venligst priserne på ordrebekræftelsen.",
    draftWatermark: "UDKAST",
  },
};

export type PODocumentLine = {
  position: number;
  ourSku: string;
  name: string;
  /** The supplier's own article number, from their offering (may be null). */
  supplierSku: string | null;
  quantity: number;
  /** Null while the price is pending (a PO "request"). */
  unitPrice: number | null;
  currency: string;
  /** quantity × unitPrice; null while unpriced. */
  lineTotal: number | null;
};

export type PODocument = {
  id: string;
  poNumber: string;
  status: string;
  /** The supplier's document language — every label on paper and in mail follows it. */
  lang: DocumentLanguage;
  orderDate: string | null;
  expectedDate: string | null;
  supplier: {
    id: string;
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    zipCode: string | null;
    town: string | null;
    country: string | null;
    emailPrimary: string | null;
    emailSecondary: string | null;
  } | null;
  lines: PODocumentLine[];
  /** Sum of priced lines per currency (usually exactly one entry). */
  totalsByCurrency: { currency: string; amount: number }[];
  /** True when at least one line still has no unit price. */
  hasUnpricedLines: boolean;
};

export async function loadPODocument(
  supabase: SupabaseClient,
  poId: string,
): Promise<PODocument | null> {
  const [poRes, linesRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        `id, po_number, status, order_date, expected_date,
         supplier:suppliers!supplier_id(
           id, name, address_line1, address_line2, zip_code, town,
           country_code, email_primary, email_secondary, document_language
         )`,
      )
      .eq("id", poId)
      .maybeSingle(),
    supabase
      .from("purchase_order_lines")
      .select(
        `quantity, unit_price, currency,
         parts(id, internal_sku, name_en)`,
      )
      .eq("purchase_order_id", poId)
      .order("created_at", { ascending: true }),
  ]);

  const po = poRes.data;
  if (!po) return null;
  const supplierRaw = Array.isArray(po.supplier) ? po.supplier[0] : po.supplier;
  const lang = asDocumentLanguage(supplierRaw?.document_language);

  // Generic-client embeds type as arrays — normalize each line's part.
  const lineRows = (linesRes.data ?? []).map((l) => ({
    ...l,
    part: Array.isArray(l.parts) ? l.parts[0] : l.parts,
  }));

  // The supplier's own article numbers for the parts on this PO.
  const partIds = lineRows
    .map((l) => l.part?.id)
    .filter((id): id is string => Boolean(id));
  const supplierSkuByPart = new Map<string, string>();
  if (supplierRaw?.id && partIds.length > 0) {
    const { data: offerings } = await supabase
      .from("part_supplier_offerings")
      .select("part_id, supplier_sku")
      .eq("supplier_id", supplierRaw.id)
      .in("part_id", partIds);
    for (const o of offerings ?? []) {
      if (o.supplier_sku) supplierSkuByPart.set(o.part_id, o.supplier_sku);
    }
  }

  const lines: PODocumentLine[] = lineRows.map((l, i) => {
    const quantity = Number(l.quantity);
    const unitPrice = l.unit_price == null ? null : Number(l.unit_price);
    return {
      position: i + 1,
      ourSku: l.part?.internal_sku ?? "—",
      name: l.part?.name_en ?? "—",
      supplierSku: l.part?.id
        ? (supplierSkuByPart.get(l.part.id) ?? null)
        : null,
      quantity,
      unitPrice,
      currency: l.currency,
      lineTotal:
        unitPrice == null
          ? null
          : Math.round(quantity * unitPrice * 100) / 100,
    };
  });

  const totals = new Map<string, number>();
  for (const l of lines) {
    if (l.lineTotal == null) continue;
    totals.set(l.currency, (totals.get(l.currency) ?? 0) + l.lineTotal);
  }

  return {
    id: po.id,
    poNumber: po.po_number,
    status: po.status,
    lang,
    orderDate: po.order_date,
    expectedDate: po.expected_date,
    supplier: supplierRaw
      ? {
          id: supplierRaw.id,
          name: supplierRaw.name,
          addressLine1: supplierRaw.address_line1,
          addressLine2: supplierRaw.address_line2,
          zipCode: supplierRaw.zip_code,
          town: supplierRaw.town,
          country: supplierRaw.country_code
            ? countryName(supplierRaw.country_code, lang)
            : null,
          emailPrimary: supplierRaw.email_primary,
          emailSecondary: supplierRaw.email_secondary,
        }
      : null,
    lines,
    totalsByCurrency: [...totals.entries()].map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
    })),
    hasUnpricedLines: lines.some((l) => l.unitPrice == null),
  };
}
