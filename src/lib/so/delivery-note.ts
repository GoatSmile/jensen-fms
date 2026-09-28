import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The delivery note (*følgeseddel*) for one sales order: what is handed over,
 * to whom, where — and NO prices. It is shown on Finn's phone and signed by
 * the recipient there (migration 107), and a technician sees no money.
 *
 * The note renders in the ORDER's language, like every customer-facing
 * document, never the phone's UI locale — the reader is the customer.
 */
export type DeliveryNote = {
  soId: string;
  soNumber: string;
  status: string;
  language: "da" | "en";
  customer: string;
  unit: string | null;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  bikes: {
    id: string;
    frameNumber: string;
    recognitionCode: string | null;
    template: string | null;
    colour: string | null;
  }[];
  parts: { sku: string | null; name: string; quantity: number }[];
  signedBy: string | null;
  signedAt: string | null;
  hasSignature: boolean;
};

export async function loadDeliveryNote(
  supabase: Supabase,
  soId: string,
): Promise<DeliveryNote | null> {
  const { data: so } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, status, language,
       delivery_contact_name, delivery_contact_phone, delivery_address,
       delivery_signed_by, delivery_signed_at, delivery_signature_path,
       organization:organizations!organization_id(
         legal_name, display_name_da, display_name_en,
         address_line1, address_line2, zip_code, city
       ),
       organization_unit:organization_units!organization_unit_id(name, address)`,
    )
    .eq("id", soId)
    .maybeSingle();
  if (!so) return null;

  const [mosRes, linesRes] = await Promise.all([
    supabase.from("manufacturing_orders").select("id").eq("sales_order_id", soId),
    supabase
      .from("sales_order_lines")
      .select(
        "line_number, quantity, description_da, description_en, part:parts!part_id(internal_sku, name_en, name_da)",
      )
      .eq("sales_order_id", soId)
      .not("part_id", "is", null)
      .order("line_number", { ascending: true }),
  ]);

  const moIds = (mosRes.data ?? []).map((m) => m.id);
  const bikeRows = moIds.length
    ? (
        await supabase
          .from("bikes")
          .select(
            `id, frame_number, status,
             template:bike_templates!template_id(name_en),
             color:colors!color_id(name_en, name_da),
             identifiers:bike_identifiers(identifier_value, is_active, type:bike_identifier_types(slug))`,
          )
          .in("manufacturing_order_id", moIds)
          .is("deleted_at", null)
          // What physically goes on the van: built bikes, and the ones this
          // order already delivered (a signed note keeps listing them).
          .in("status", ["in_stock", "assigned", "in_service"])
          .order("frame_number", { ascending: true })
      ).data ?? []
    : [];

  const da = so.language !== "en";
  const org = one(so.organization);
  const unit = one(so.organization_unit);
  const orgAddress = org
    ? [org.address_line1, org.address_line2, [org.zip_code, org.city].filter(Boolean).join(" ")]
        .filter((p) => p && String(p).trim())
        .join(", ")
    : "";

  return {
    soId: so.id,
    soNumber: so.sales_order_number,
    status: so.status,
    language: da ? "da" : "en",
    customer:
      (da ? org?.display_name_da : org?.display_name_en) ??
      org?.display_name_da ??
      org?.legal_name ??
      "—",
    unit: unit?.name ?? null,
    contactName: so.delivery_contact_name,
    contactPhone: so.delivery_contact_phone,
    // The order's own delivery address first, then the department's, then the
    // customer's — the van needs somewhere to go.
    address: so.delivery_address ?? unit?.address ?? (orgAddress || null),
    bikes: bikeRows.map((b) => {
      const code = (b.identifiers ?? []).find(
        (i) => i.is_active && one(i.type)?.slug === "fleet_number",
      );
      const color = one(b.color);
      return {
        id: b.id,
        frameNumber: b.frame_number,
        recognitionCode: code?.identifier_value ?? null,
        template: one(b.template)?.name_en ?? null,
        colour: color ? ((da ? color.name_da : color.name_en) ?? color.name_en) : null,
      };
    }),
    parts: (linesRes.data ?? []).map((l) => {
      const part = one(l.part);
      return {
        sku: part?.internal_sku ?? null,
        name:
          (da ? l.description_da : l.description_en) ??
          (da ? part?.name_da : null) ??
          part?.name_en ??
          "—",
        quantity: Number(l.quantity),
      };
    }),
    signedBy: so.delivery_signed_by,
    signedAt: so.delivery_signed_at,
    hasSignature: so.delivery_signature_path != null,
  };
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Labels for the note, in the order's language. */
export const DELIVERY_NOTE_LABELS = {
  da: {
    title: "Følgeseddel",
    order: "Ordre",
    customer: "Kunde",
    department: "Afdeling",
    contact: "Modtager",
    phone: "Telefon",
    address: "Leveringsadresse",
    bikes: "Cykler",
    frame: "Stelnummer",
    code: "Kode",
    model: "Model",
    colour: "Farve",
    parts: "Dele og tilbehør",
    qty: "Antal",
    signHere: "Kvittering for modtagelse",
    signerName: "Modtagerens navn",
    signedBy: "Modtaget af",
    signedAt: "Tidspunkt",
    none: "—",
  },
  en: {
    title: "Delivery note",
    order: "Order",
    customer: "Customer",
    department: "Department",
    contact: "Recipient",
    phone: "Phone",
    address: "Delivery address",
    bikes: "Bikes",
    frame: "Frame number",
    code: "Code",
    model: "Model",
    colour: "Colour",
    parts: "Parts and accessories",
    qty: "Qty",
    signHere: "Receipt of delivery",
    signerName: "Recipient's name",
    signedBy: "Received by",
    signedAt: "Time",
    none: "—",
  },
} as const;
