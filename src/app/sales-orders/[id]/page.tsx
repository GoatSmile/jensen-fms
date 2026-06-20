import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatDeliveryTarget } from "@/lib/iso-week";
import { formatPrice } from "@/lib/format";
import { canEditSOLines, type SOStatus } from "@/lib/so/status";
import type { MOStatus } from "@/lib/mo/status";
import type { PaintOrderStatus } from "@/lib/paint/status";

import { SOHeader } from "../_components/so-header";
import {
  LinkedPaintOrdersSection,
  type LinkedPaintRow,
} from "./_components/linked-paint-orders-section";
import { ProductionNoteCard } from "./_components/production-note-card";
import {
  LinesSection,
  type SOLineRow,
} from "./_components/lines-section";
import type {
  ColorChoice,
  PartChoice,
  TemplateChoice,
  VatCodeChoice,
} from "./_components/line-dialog";
import {
  LinkedMOsSection,
  type LinkedMORow,
} from "./_components/linked-mos-section";

export default async function SODetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: so, error } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, status, language, order_date,
       requested_delivery_date, requested_delivery_precision, actual_delivery_date,
       currency, subtotal_amount, total_vat_amount, total_amount,
       notes, production_note, created_at,
       organization:organizations!organization_id(
         id, legal_name, display_name_en, display_name_da, default_vat_code
       ),
       organization_unit:organization_units!organization_unit_id(id, name),
       contact:contacts!contact_id(id, first_name, last_name, role)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load SO: ${error.message}`);
  if (!so) notFound();

  const status = so.status as SOStatus;
  const editableLines = canEditSOLines(status);
  const canSpawn =
    status === "draft" ||
    status === "confirmed" ||
    status === "in_production";

  // Lines, MOs, paint orders, and picker/catalog data in parallel.
  const [linesRes, mosRes, paintRes, partsRes, templatesRes, vatRes, colorsRes] =
    await Promise.all([
      supabase
        .from("sales_order_lines")
        .select(
          `id, line_number, part_id, bike_template_id, quantity, unit_price,
           vat_code, vat_rate, line_subtotal, line_vat_amount, line_total,
           color_id, description_en, description_da,
           part:parts!part_id(id, internal_sku, name_en),
           template:bike_templates!bike_template_id(id, name_en, family, frame_size),
           color:colors!color_id(name_en)`,
        )
        .eq("sales_order_id", id)
        .order("line_number", { ascending: true }),
      supabase
        .from("manufacturing_orders")
        .select(
          `id, mo_number, status, target_quantity, completed_quantity,
           planned_completion_date,
           bike_template:bike_templates!bike_template_id(name_en, family, frame_size)`,
        )
        .eq("sales_order_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("paint_orders")
        .select(
          `id, paint_order_number, status,
           supplier:suppliers(name),
           color:colors(name_en, hex),
           paint_order_bikes(count)`,
        )
        .eq("sales_order_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("parts")
        .select("id, internal_sku, name_en")
        .is("deleted_at", null)
        .order("internal_sku", { ascending: true }),
      // bike_templates uses is_current as the soft-archive flag (no
      // deleted_at column on this table — that's a parts/orgs convention).
      supabase
        .from("bike_templates")
        .select("id, name_en, family, frame_size, is_current")
        .eq("is_current", true)
        .order("family", { ascending: true })
        .order("frame_size", { ascending: true }),
      supabase
        .from("vat_codes")
        .select("code, name_en, default_rate, is_active")
        .eq("is_active", true)
        .order("default_rate", { ascending: false }),
      supabase
        .from("colors")
        .select("id, name_en, hex, ral_code, coating, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true }),
    ]);

  // Per-line linked-MO counts so the spawn-MO action is hidden when an
  // active MO already exists.
  const linkedCountsByLine = new Map<string, number>();
  for (const m of mosRes.data ?? []) {
    if (m.status === "cancelled") continue;
    // We don't select sales_order_line_id in the MO query above; pull it.
  }
  // Cheap separate query: line ids referenced by non-cancelled MOs.
  const { data: lineMoLinks } = await supabase
    .from("manufacturing_orders")
    .select("sales_order_line_id, status")
    .eq("sales_order_id", id);
  for (const m of lineMoLinks ?? []) {
    if (m.status === "cancelled") continue;
    if (!m.sales_order_line_id) continue;
    linkedCountsByLine.set(
      m.sales_order_line_id,
      (linkedCountsByLine.get(m.sales_order_line_id) ?? 0) + 1,
    );
  }

  const lineRows: SOLineRow[] = (linesRes.data ?? []).map((l) => ({
    id: l.id,
    lineNumber: l.line_number,
    kind: l.bike_template_id ? "template" : "part",
    partId: l.part_id ?? null,
    partSku: l.part?.internal_sku ?? null,
    partName: l.part?.name_en ?? null,
    bikeTemplateId: l.bike_template_id ?? null,
    templateLabel: l.template
      ? [l.template.family, l.template.frame_size, l.template.name_en]
          .filter(Boolean)
          .join(" · ")
      : null,
    colorId: l.color_id ?? null,
    colorName: l.color?.name_en ?? null,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price),
    vatCode: l.vat_code ?? null,
    vatRate: Number(l.vat_rate ?? 0),
    subtotal: Number(l.line_subtotal ?? 0),
    vatAmount: Number(l.line_vat_amount ?? 0),
    total: Number(l.line_total ?? 0),
    descriptionEn: l.description_en ?? null,
    descriptionDa: l.description_da ?? null,
    linkedMoCount: linkedCountsByLine.get(l.id) ?? 0,
  }));

  const moRows: LinkedMORow[] = (mosRes.data ?? []).map((m) => ({
    id: m.id,
    mo_number: m.mo_number,
    status: m.status as MOStatus,
    target_quantity: m.target_quantity,
    completed_quantity: m.completed_quantity,
    planned_completion_date: m.planned_completion_date,
    templateLabel: m.bike_template
      ? [
          m.bike_template.family,
          m.bike_template.frame_size,
          m.bike_template.name_en,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
  }));

  const paintRows: LinkedPaintRow[] = (paintRes.data ?? []).map((p) => ({
    id: p.id,
    paint_order_number: p.paint_order_number,
    status: p.status as PaintOrderStatus,
    supplierName: p.supplier?.name ?? null,
    colorName: p.color?.name_en ?? null,
    colorHex: p.color?.hex ?? null,
    bikeCount: p.paint_order_bikes?.[0]?.count ?? 0,
  }));
  const canCreatePaint = status !== "cancelled" && status !== "delivered";

  const customerName =
    so.organization?.display_name_da ??
    so.organization?.display_name_en ??
    so.organization?.legal_name ??
    "—";
  const customerId = so.organization?.id ?? "";
  const unitName = so.organization_unit?.name ?? null;
  const contactName = so.contact
    ? `${[so.contact.first_name, so.contact.last_name].filter(Boolean).join(" ").trim() || "(no name)"}${so.contact.role ? ` · ${so.contact.role}` : ""}`
    : null;

  const parts: PartChoice[] = (partsRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
  }));
  const templates: TemplateChoice[] = (templatesRes.data ?? []).map((t) => ({
    id: t.id,
    name_en: t.name_en,
    family: t.family,
    frame_size: t.frame_size,
  }));
  const vatCodes: VatCodeChoice[] = (vatRes.data ?? []).map((v) => ({
    code: v.code,
    name_en: v.name_en,
    default_rate: Number(v.default_rate),
  }));
  const colors: ColorChoice[] = colorsRes.data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/sales-orders">Sales orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              <SegmentedId value={so.sales_order_number} />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <SOHeader
        soId={so.id}
        soNumber={so.sales_order_number}
        status={status}
        customerName={customerName}
        customerId={customerId}
        unitName={unitName}
      />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label="Order date">{formatDate(so.order_date)}</Stat>
        <Stat label="Expected delivery">
          {formatDeliveryTarget(
            so.requested_delivery_date,
            so.requested_delivery_precision,
            so.language === "da" ? "da" : "en",
          ) ?? "—"}
        </Stat>
        <Stat label="Actual delivery">
          {formatDate(so.actual_delivery_date)}
        </Stat>
        <Stat label="Contact">
          {contactName ?? <Muted>—</Muted>}
        </Stat>
        <Stat label="Language">
          {so.language === "da" ? "Dansk" : "English"}
        </Stat>
        <Stat label="Subtotal" className="tabular-nums">
          {formatPrice(
            so.subtotal_amount != null ? Number(so.subtotal_amount) : null,
            so.currency,
          )}
        </Stat>
        <Stat label="VAT" className="tabular-nums">
          {formatPrice(
            so.total_vat_amount != null ? Number(so.total_vat_amount) : null,
            so.currency,
          )}
        </Stat>
        <Stat label="Total" className="tabular-nums font-medium">
          {formatPrice(
            so.total_amount != null ? Number(so.total_amount) : null,
            so.currency,
          )}
        </Stat>
      </dl>

      {so.notes ? (
        <p className="text-muted-foreground bg-muted/30 rounded-md border p-3 text-sm whitespace-pre-wrap">
          {so.notes}
        </p>
      ) : null}

      <ProductionNoteCard
        soId={so.id}
        initialNote={so.production_note}
        editable={status !== "cancelled" && status !== "delivered"}
      />

      <LinesSection
        soId={so.id}
        currency={so.currency}
        defaultVatCode={so.organization?.default_vat_code ?? null}
        editable={editableLines}
        canSpawn={canSpawn}
        rows={lineRows}
        parts={parts}
        templates={templates}
        vatCodes={vatCodes}
        colors={colors}
      />

      <LinkedMOsSection rows={moRows} />

      <LinkedPaintOrdersSection
        soId={so.id}
        rows={paintRows}
        canCreate={canCreatePaint}
      />
    </div>
  );
}

function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs uppercase">{label}</dt>
      <dd className={`text-sm ${className ?? ""}`}>{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
