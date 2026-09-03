import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SegmentedId } from "@/components/segmented-id";
import { localizedName } from "@/i18n/vocab";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatDeliveryTarget } from "@/lib/iso-week";
import { formatPrice } from "@/lib/format";
import { canEditSOLines, type SOStatus } from "@/lib/so/status";
import type { MOStatus } from "@/lib/mo/status";
import type { ServiceOrderStatus } from "@/lib/services/status";

import { SOHeader } from "../_components/so-header";
import {
  LinkedPaintOrdersSection,
  type LinkedPaintRow,
} from "./_components/linked-paint-orders-section";
import { loadAtSupplierBikeIds } from "@/lib/services/at-supplier";
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
import {
  PaymentsSection,
  type SOInvoiceRow,
} from "./_components/payments-section";
import { round2, type InvoiceStatus } from "@/lib/invoicing/status";

export default async function SODetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tSo, tCommon, locale] = await Promise.all([
    getTranslations("soDetail"),
    getTranslations("so"),
    getTranslations("common"),
    getLocale(),
  ]);
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
  const [
    linesRes,
    mosRes,
    paintRes,
    partsRes,
    templatesRes,
    vatRes,
    colorsRes,
    invoicesRes,
  ] = await Promise.all([
      supabase
        .from("sales_order_lines")
        .select(
          `id, line_number, part_id, bike_template_id, quantity, unit_price,
           vat_code, vat_rate, line_subtotal, line_vat_amount, line_total,
           color_id, description_en, description_da,
           part:parts!part_id(id, internal_sku, name_en),
           template:bike_templates!bike_template_id(id, name_en, family:bike_families(name), frame_size),
           color:colors!color_id(name_en, name_da)`,
        )
        .eq("sales_order_id", id)
        .order("line_number", { ascending: true }),
      supabase
        .from("manufacturing_orders")
        .select(
          `id, mo_number, status, target_quantity, completed_quantity,
           planned_completion_date,
           bike_template:bike_templates!bike_template_id(name_en, family:bike_families(name), frame_size)`,
        )
        .eq("sales_order_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("service_orders")
        .select(
          `id, order_number, status,
           supplier:suppliers(name),
           color:colors(name_en, name_da, hex),
           service_order_bikes(count)`,
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
        .select(
          "id, name_en, family_id, family:bike_families(name, sort_order), frame_size, is_current",
        )
        .eq("is_current", true)
        .order("frame_size", { ascending: true }),
      supabase
        .from("vat_codes")
        .select("code, name_en, name_da, default_rate, is_active")
        .eq("is_active", true)
        .order("default_rate", { ascending: false }),
      supabase
        .from("colors")
        .select("id, name_en, name_da, hex, ral_code, coating, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true }),
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, kind, status, total_amount, currency, credited_invoice_id",
        )
        .eq("sales_order_id", id)
        .is("credited_invoice_id", null)
        .order("created_at", { ascending: true }),
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
      ? [l.template.family?.name, l.template.frame_size, l.template.name_en]
          .filter(Boolean)
          .join(" · ")
      : null,
    colorId: l.color_id ?? null,
    colorName: l.color
      ? localizedName(locale, l.color.name_en, l.color.name_da)
      : null,
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

  // Bikes per MO and how many are away at the painter — the phone question
  // ("is my frame at the painter?") answered from the SO without opening each
  // MO. The count is BIKES: what goes to the painter is a set of parts per
  // bike, and calling the column "frames" is what made a four-part paint order
  // read as frames-only (DECISIONS 2026-09-03).
  const moIds = (mosRes.data ?? []).map((m) => m.id);
  const bikesByMo = new Map<string, { total: number; atPainter: number }>();
  if (moIds.length > 0) {
    const { data: moBikes } = await supabase
      .from("bikes")
      .select("id, manufacturing_order_id")
      .in("manufacturing_order_id", moIds)
      .is("deleted_at", null);
    const away = await loadAtSupplierBikeIds(
      supabase,
      (moBikes ?? []).map((b) => b.id),
    );
    for (const b of moBikes ?? []) {
      if (!b.manufacturing_order_id) continue;
      const cur = bikesByMo.get(b.manufacturing_order_id) ?? {
        total: 0,
        atPainter: 0,
      };
      cur.total += 1;
      if (away.has(b.id)) cur.atPainter += 1;
      bikesByMo.set(b.manufacturing_order_id, cur);
    }
  }

  const moRows: LinkedMORow[] = (mosRes.data ?? []).map((m) => ({
    id: m.id,
    mo_number: m.mo_number,
    status: m.status as MOStatus,
    target_quantity: m.target_quantity,
    completed_quantity: m.completed_quantity,
    planned_completion_date: m.planned_completion_date,
    bikeCount: bikesByMo.get(m.id)?.total ?? 0,
    atPainterCount: bikesByMo.get(m.id)?.atPainter ?? 0,
    templateLabel: m.bike_template
      ? [
          m.bike_template.family?.name,
          m.bike_template.frame_size,
          m.bike_template.name_en,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
  }));

  const paintRows: LinkedPaintRow[] = (paintRes.data ?? []).map((p) => ({
    id: p.id,
    order_number: p.order_number,
    status: p.status as ServiceOrderStatus,
    supplierName: p.supplier?.name ?? null,
    colorName: p.color
      ? localizedName(locale, p.color.name_en, p.color.name_da)
      : null,
    colorHex: p.color?.hex ?? null,
    bikeCount: p.service_order_bikes?.[0]?.count ?? 0,
  }));
  const canCreatePaint = status !== "cancelled" && status !== "delivered";

  // Payments: deposits + final invoices on this SO. credited_invoice_id IS NULL
  // already excludes credit notes; "invoiced" sums the live (non-cancelled,
  // non-credited) ones against the order total for the % surface.
  const invoiceRows: SOInvoiceRow[] = (invoicesRes.data ?? []).map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    kind: (inv.kind as SOInvoiceRow["kind"]) ?? "standard",
    status: inv.status as InvoiceStatus,
    total_amount: Number(inv.total_amount ?? 0),
    currency: (inv.currency as string | null)?.trim() || "DKK",
  }));
  const invoicedTotal = round2(
    invoiceRows
      .filter((inv) => inv.status !== "cancelled" && inv.status !== "credited")
      .reduce((sum, inv) => sum + inv.total_amount, 0),
  );
  const canDeposit =
    status === "confirmed" ||
    status === "in_production" ||
    status === "ready";

  const customerName =
    so.organization?.display_name_da ??
    so.organization?.display_name_en ??
    so.organization?.legal_name ??
    "—";
  const customerId = so.organization?.id ?? "";
  const unitName = so.organization_unit?.name ?? null;
  const contactName = so.contact
    ? `${[so.contact.first_name, so.contact.last_name].filter(Boolean).join(" ").trim() || tSo("noName")}${so.contact.role ? ` · ${so.contact.role}` : ""}`
    : null;

  const parts: PartChoice[] = (partsRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
  }));
  // Family-adjacent ordering (admin sort_order, then name) so all sizes of
  // e.g. "Norma" sit together in the picker instead of interleaving by size.
  const templates: TemplateChoice[] = (templatesRes.data ?? [])
    .map((t) => ({
      id: t.id,
      name_en: t.name_en,
      family: t.family?.name ?? null,
      family_id: t.family_id ?? null,
      family_sort: t.family?.sort_order ?? null,
      frame_size: t.frame_size,
    }))
    .sort(
      (a, b) =>
        (a.family_sort ?? Number.MAX_SAFE_INTEGER) -
          (b.family_sort ?? Number.MAX_SAFE_INTEGER) ||
        (a.family ?? a.name_en).localeCompare(b.family ?? b.name_en) ||
        (a.frame_size ?? "").localeCompare(b.frame_size ?? "", undefined, {
          numeric: true,
        }) ||
        a.name_en.localeCompare(b.name_en),
    );
  const vatCodes: VatCodeChoice[] = (vatRes.data ?? []).map((v) => ({
    code: v.code,
    name_en: v.name_en,
    name_da: v.name_da,
    default_rate: Number(v.default_rate),
  }));
  const colors: ColorChoice[] = colorsRes.data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/sales-orders">{tSo("title")}</Link>
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
        <Stat label={t("statOrderDate")}>{formatDate(so.order_date)}</Stat>
        <Stat label={t("statExpectedDelivery")}>
          {formatDeliveryTarget(
            so.requested_delivery_date,
            so.requested_delivery_precision,
            so.language === "da" ? "da" : "en",
          ) ?? "—"}
        </Stat>
        <Stat label={t("statActualDelivery")}>
          {formatDate(so.actual_delivery_date)}
        </Stat>
        <Stat label={t("statContact")}>
          {contactName ?? <Muted>—</Muted>}
        </Stat>
        <Stat label={t("statLanguage")}>
          {so.language === "da" ? "Dansk" : "English"}
        </Stat>
        <Stat label={t("statSubtotal")} className="tabular-nums">
          {formatPrice(
            so.subtotal_amount != null ? Number(so.subtotal_amount) : null,
            so.currency,
          )}
        </Stat>
        <Stat label={t("statVat")} className="tabular-nums">
          {formatPrice(
            so.total_vat_amount != null ? Number(so.total_vat_amount) : null,
            so.currency,
          )}
        </Stat>
        <Stat label={t("statTotal")} className="tabular-nums font-medium">
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

      {/* Lifecycle order with contiguous tint bands: the order itself
          (neutral) → production (sky: note + MOs + paint) → settlement
          (amber). The production note heads the band it instructs. */}
      <ProductionNoteCard
        soId={so.id}
        initialNote={so.production_note}
        editable={status !== "cancelled" && status !== "delivered"}
      />

      <LinkedMOsSection rows={moRows} />

      <LinkedPaintOrdersSection
        soId={so.id}
        rows={paintRows}
        canCreate={canCreatePaint}
      />

      <PaymentsSection
        soId={so.id}
        rows={invoiceRows}
        invoicedTotal={invoicedTotal}
        soTotal={so.total_amount != null ? Number(so.total_amount) : 0}
        currency={so.currency}
        canDeposit={canDeposit}
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
