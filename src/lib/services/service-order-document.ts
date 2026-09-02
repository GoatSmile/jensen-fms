/**
 * The supplier-facing view of a service order (today: the paint order) — one
 * loader shared by the print page (/paint-orders/[id]/print) and the
 * email-to-painter action, so paper and mail can never disagree about what
 * was ordered. Mirrors `src/lib/purchasing/po-document.ts`.
 *
 * Renders in the SUPPLIER's language (`suppliers.document_language`), not the
 * UI locale: Metacoat reads Danish whatever the person at the keyboard has
 * chosen. The labels live in DOC_LABELS here rather than in messages/*.json
 * because per-document language is the invoice-print pattern, and the email
 * renderer is a pure function with no next-intl context.
 *
 * Prices: a `planned` order prices live off the supplier's CURRENT list (an
 * estimate, flagged as such); once sent, the frozen snapshot on each line is
 * what prints. Order and line notes are internal working notes and are NOT
 * included — the send dialog's message is the only free text that reaches
 * the supplier (same doctrine as the PO document).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { countryName } from "@/lib/countries";
import { colorFinishLabel } from "@/lib/colors/coating";
import { localizedName } from "@/i18n/vocab";
import { one } from "@/lib/supabase/embed";
import { loadCurrentPriceList, priceOrderItems } from "@/lib/services/pricing";
import {
  asDocumentLanguage,
  type DocumentLanguage,
} from "@/lib/documents/language";

export type { DocumentLanguage } from "@/lib/documents/language";

export type DocumentLabels = {
  supplier: string;
  ourRef: string;
  batchColour: string;
  plannedSend: string;
  sent: string;
  expectedReturn: string;
  frames: string;
  frameNumber: string;
  model: string;
  item: string;
  yourItemNo: string;
  colour: string;
  qty: string;
  unitPrice: string;
  amount: string;
  total: string;
  pricePending: string;
  /** Under the table: where the prices come from. {list} = price list name. */
  pricesPerList: string;
  unpricedNote: string;
  draftWatermark: string;
  noFrames: string;
};

export const DOC_LABELS: Record<DocumentLanguage, DocumentLabels> = {
  en: {
    supplier: "Supplier",
    ourRef: "Our reference",
    batchColour: "Batch colour",
    plannedSend: "Planned send date",
    sent: "Sent",
    expectedReturn: "Expected return",
    frames: "Frames in this order",
    frameNumber: "Frame number",
    model: "Model",
    item: "Item",
    yourItemNo: "Your item no.",
    colour: "Colour",
    qty: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    total: "Total",
    pricePending: "price pending",
    pricesPerList: "Prices per your price list “{list}”.",
    unpricedNote:
      "Lines marked “price pending” are not on your current price list — please confirm the price on the order confirmation.",
    draftWatermark: "DRAFT",
    noFrames: "No frame numbers attached — loose parts only.",
  },
  da: {
    supplier: "Leverandør",
    ourRef: "Vores reference",
    batchColour: "Farve (ordre)",
    plannedSend: "Planlagt afsendelse",
    sent: "Afsendt",
    expectedReturn: "Forventet retur",
    frames: "Stel i denne ordre",
    frameNumber: "Stelnummer",
    model: "Model",
    item: "Emne",
    yourItemNo: "Jeres varenr.",
    colour: "Farve",
    qty: "Antal",
    unitPrice: "Stykpris",
    amount: "Beløb",
    total: "I alt",
    pricePending: "pris afventer",
    pricesPerList: "Priser iflg. jeres prisliste “{list}”.",
    unpricedNote:
      "Linjer markeret “pris afventer” findes ikke på jeres gældende prisliste — bekræft venligst prisen på ordrebekræftelsen.",
    draftWatermark: "UDKAST",
    noFrames: "Ingen stelnumre tilknyttet — kun løse dele.",
  },
};

/** Document title per service type. Nav/routes are per type permanently, so is this. */
const DOC_TITLES: Record<string, Record<DocumentLanguage, string>> = {
  painting: { en: "Paint order", da: "Lakeringsordre" },
};

export type ServiceOrderDocumentLine = {
  position: number;
  partType: string;
  /** The supplier's own item number from their price list (may be null). */
  supplierItemNo: string | null;
  colour: string | null;
  colourFinish: string | null;
  quantity: number;
  /** Null while unpriceable (not on the list / no list). */
  unitPrice: number | null;
  currency: string | null;
  lineTotal: number | null;
};

export type ServiceOrderDocumentBike = {
  frameNumber: string;
  templateLabel: string | null;
};

export type ServiceOrderDocument = {
  id: string;
  orderNumber: string;
  status: string;
  lang: DocumentLanguage;
  title: string;
  plannedSendDate: string | null;
  sentAt: string | null;
  expectedReturnAt: string | null;
  salesOrderNumber: string | null;
  batchColour: string | null;
  batchColourFinish: string | null;
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
  bikes: ServiceOrderDocumentBike[];
  lines: ServiceOrderDocumentLine[];
  totalsByCurrency: { currency: string; amount: number }[];
  hasUnpricedLines: boolean;
  /** `planned` → live estimate off the current list; frozen snapshots after send. */
  pricesAreEstimates: boolean;
  priceListName: string | null;
};

export async function loadServiceOrderDocument(
  supabase: SupabaseClient<Database>,
  serviceOrderId: string,
): Promise<ServiceOrderDocument | null> {
  const [orderRes, itemsRes, bikesRes] = await Promise.all([
    supabase
      .from("service_orders")
      .select(
        `id, order_number, status, supplier_id, service_type_id,
         planned_send_date, sent_at, expected_return_at,
         supplier:suppliers!supplier_id(
           id, name, address_line1, address_line2, zip_code, town,
           country_code, email_primary, email_secondary, document_language
         ),
         color:colors!color_id(name_en, name_da, ral_code, coating),
         sales_order:sales_orders!sales_order_id(sales_order_number),
         service_type:service_types!service_type_id(slug, name_en, name_da)`,
      )
      .eq("id", serviceOrderId)
      .maybeSingle(),
    supabase
      .from("service_order_items")
      .select(
        `id, service_part_type_id, quantity, supplier_item_no, unit_price, currency,
         part_type:service_part_types!service_part_type_id(name_en, name_da),
         color:colors!color_id(name_en, name_da, ral_code, coating)`,
      )
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("service_order_bikes")
      .select(
        `added_at,
         bike:bikes!bike_id(
           frame_number, deleted_at,
           template:bike_templates(name_en, frame_size, family:bike_families(name))
         )`,
      )
      .eq("service_order_id", serviceOrderId)
      .order("added_at", { ascending: true }),
  ]);

  const order = orderRes.data;
  if (!order) return null;

  const supplier = one(order.supplier);
  const serviceType = one(order.service_type);
  const batch = one(order.color);
  const lang = asDocumentLanguage(supplier?.document_language);
  const labelLang = lang; // localizedName takes a locale string; "da" | "en" both fit.

  const isPlanned = order.status === "planned";
  const items = itemsRes.data ?? [];

  // Live pricing only while planned — after send, the snapshot on each line
  // is the truth and the current list is irrelevant to this document.
  const list = isPlanned
    ? await loadCurrentPriceList(
        supabase,
        order.supplier_id,
        order.service_type_id,
      )
    : null;
  const priced =
    isPlanned && list
      ? priceOrderItems(
          list,
          items.map((i) => ({
            id: i.id,
            service_part_type_id: i.service_part_type_id,
            quantity: i.quantity,
          })),
        )
      : null;

  const lines: ServiceOrderDocumentLine[] = items.map((i, idx) => {
    const partType = one(i.part_type);
    const colour = one(i.color);
    let unitPrice: number | null;
    let currency: string | null;
    let supplierItemNo: string | null;
    if (isPlanned) {
      const r = priced?.byItemId.get(i.id) ?? null;
      unitPrice = r ? r.item.unit_price : null;
      currency = list?.currency ?? null;
      supplierItemNo = r?.item.supplier_item_no ?? null;
    } else {
      unitPrice = i.unit_price == null ? null : Number(i.unit_price);
      currency = i.currency;
      supplierItemNo = i.supplier_item_no;
    }
    const quantity = Number(i.quantity);
    return {
      position: idx + 1,
      partType: partType
        ? localizedName(labelLang, partType.name_en, partType.name_da)
        : "—",
      supplierItemNo,
      colour: colour
        ? localizedName(labelLang, colour.name_en, colour.name_da)
        : null,
      colourFinish: colour
        ? colorFinishLabel(colour.ral_code, colour.coating, lang)
        : null,
      quantity,
      unitPrice,
      currency,
      lineTotal:
        unitPrice == null
          ? null
          : Math.round(quantity * unitPrice * 100) / 100,
    };
  });

  const totals = new Map<string, number>();
  for (const l of lines) {
    if (l.lineTotal == null || !l.currency) continue;
    totals.set(l.currency, (totals.get(l.currency) ?? 0) + l.lineTotal);
  }

  const bikes: ServiceOrderDocumentBike[] = (bikesRes.data ?? [])
    .map((r) => one(r.bike))
    .filter(
      (b): b is NonNullable<typeof b> => b != null && b.deleted_at == null,
    )
    .map((b) => {
      const tpl = one(b.template);
      const family = tpl ? one(tpl.family) : null;
      return {
        frameNumber: b.frame_number,
        templateLabel: tpl
          ? [family?.name, tpl.frame_size, tpl.name_en].filter(Boolean).join(" · ")
          : null,
      };
    });

  const slug = serviceType?.slug ?? "";
  const title =
    DOC_TITLES[slug]?.[lang] ??
    (serviceType
      ? localizedName(labelLang, serviceType.name_en, serviceType.name_da)
      : DOC_TITLES.painting[lang]);

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    lang,
    title,
    plannedSendDate: order.planned_send_date,
    sentAt: order.sent_at,
    expectedReturnAt: order.expected_return_at,
    salesOrderNumber: one(order.sales_order)?.sales_order_number ?? null,
    batchColour: batch
      ? localizedName(labelLang, batch.name_en, batch.name_da)
      : null,
    batchColourFinish: batch
      ? colorFinishLabel(batch.ral_code, batch.coating, lang)
      : null,
    supplier: supplier
      ? {
          id: supplier.id,
          name: supplier.name,
          addressLine1: supplier.address_line1,
          addressLine2: supplier.address_line2,
          zipCode: supplier.zip_code,
          town: supplier.town,
          country: supplier.country_code
            ? countryName(supplier.country_code, lang)
            : null,
          emailPrimary: supplier.email_primary,
          emailSecondary: supplier.email_secondary,
        }
      : null,
    bikes,
    lines,
    totalsByCurrency: [...totals.entries()].map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
    })),
    hasUnpricedLines: lines.some((l) => l.unitPrice == null),
    pricesAreEstimates: isPlanned,
    priceListName: list?.name ?? null,
  };
}
