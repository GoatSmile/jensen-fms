import Link from "next/link";
import { Field } from "@/components/field";
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
import { ColorChip } from "@/components/color-swatch";
import { colorFinishLabel } from "@/lib/colors/coating";
import { localizedName } from "@/i18n/vocab";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import { formatDateTime } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import type { BikeStatus } from "@/lib/bikes/status";
import {
  OPEN_SERVICE_ORDER_STATUSES,
  type ServiceOrderStatus,
} from "@/lib/services/status";
import {
  loadCurrentPriceList,
  priceOrderItems,
  tierLabel,
} from "@/lib/services/pricing";
import { loadActiveServicePartTypes } from "@/lib/services/vocab";
import type { ColorOption } from "@/app/paint-orders/_components/paint-order-form";

import type { EligibleBikeOption } from "./_components/add-bike-to-paint-dialog";
import { PaintOrderBikesSection } from "./_components/paint-order-bikes-section";
import type { PaintOrderBikeRow } from "./_components/paint-order-bikes-section";
import { PaintOrderHeader } from "./_components/paint-order-header";
import {
  ServiceOrderItemsSection,
  type ServiceOrderItemRow,
} from "./_components/service-order-items-section";
import { Section } from "./_components/section";
import { OutboundMessageList } from "@/components/outbound-message-list";
import { loadOutboundForOrder } from "@/lib/email/outbox-queries";

export default async function PaintOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tPo, tCommon, tOutbox, locale] = await Promise.all([
    getTranslations("paintOrderDetail"),
    getTranslations("paintOrders"),
    getTranslations("common"),
    getTranslations("outbox"),
    getLocale(),
  ]);
  // Read-only labels for the pre-items paint model's per-bike scope.
  const LEGACY_SCOPE_LABEL: Record<string, string> = {
    std: t("legacyStd"),
    svaj: t("legacySvaj"),
  };
  const supabase = await createClient();
  const sentMessages = await loadOutboundForOrder(supabase, {
    serviceOrderId: id,
  });

  const orderRes = await supabase
    .from("service_orders")
    .select(
      `
        id, order_number, status, supplier_id, service_type_id,
        planned_send_date, sent_at, expected_return_at, received_at,
        notes, created_at, emailed_at, emailed_to,
        supplier:suppliers(id, name, email_primary, email_secondary, default_email_message),
        color:colors(id, slug, name_en, name_da, hex, ral_code, coating),
        sales_order:sales_orders!sales_order_id(id, sales_order_number)
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (orderRes.error) {
    throw new Error(`Failed to load order: ${orderRes.error.message}`);
  }
  if (!orderRes.data) notFound();
  const order = orderRes.data;
  const isPlanned = order.status === "planned";

  // Items, bike links (+ legacy colour/scope), the picker's eligible bikes,
  // colours, part types, and the supplier's current price list — one
  // round-trip. Eligible = non-deleted bikes NOT in an open build-blocking
  // service order (PostgREST can't NOT-IN a subquery, so we filter
  // client-side).
  const [
    itemsRes,
    linkRes,
    allBikesRes,
    openLinksRes,
    colorsRes,
    partTypes,
    priceList,
    settingsRes,
    paintablePartsRes,
  ] = await Promise.all([
    supabase
      .from("service_order_items")
      .select(
        `
          id, service_part_type_id, quantity, notes,
          supplier_item_no, unit_price, currency, part_id,
          named_part:parts!part_id(id, internal_sku, name_en),
          part_type:service_part_types(id, name_en, name_da),
          color:colors(id, name_en, name_da, hex, ral_code, coating)
        `,
      )
      .eq("service_order_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("service_order_bikes")
      .select(
        `
          bike_id, added_at, notes, scope,
          color:colors(id, name_en, name_da, hex),
          bike:bikes(
            id, frame_number, status,
            template:bike_templates(id, name_en, family:bike_families(name), frame_size, version)
          )
        `,
      )
      .eq("service_order_id", id)
      .order("added_at", { ascending: true }),
    // The picker groups by customer order, so each bike carries its MO → SO →
    // customer chain (and its slated owner as the fallback name).
    supabase
      .from("bikes")
      .select(
        `
          id, frame_number, status,
          template:bike_templates(id, name_en, family:bike_families(name), frame_size),
          owner_organization:organizations!owner_organization_id(legal_name, display_name_en, display_name_da),
          manufacturing_order:manufacturing_orders!manufacturing_order_id(
            mo_number,
            sales_order:sales_orders!sales_order_id(
              id, sales_order_number,
              organization:organizations!organization_id(legal_name, display_name_en, display_name_da)
            )
          )
        `,
      )
      .is("deleted_at", null)
      .order("frame_number", { ascending: true }),
    supabase
      .from("service_order_bikes")
      .select(
        `
          bike_id,
          service_order:service_orders!inner(
            status,
            service_type:service_types!service_type_id(blocks_build)
          )
        `,
      )
      .in("service_order.status", OPEN_SERVICE_ORDER_STATUSES),
    supabase
      .from("colors")
      .select("id, name_en, name_da, hex, ral_code, coating")
      .eq("is_active", true)
      .order("name_en", { ascending: true }),
    loadActiveServicePartTypes(supabase),
    loadCurrentPriceList(supabase, order.supplier_id, order.service_type_id),
    // Outbound test mode + inboxes: the email dialog says where mail really goes.
    supabase
      .from("app_settings")
      .select("outbound_test_mode, outbound_test_email")
      .eq("id", 1)
      .maybeSingle(),
    // Parts a line can name: anything paintable (raw or variant), for the
    // specific-part picker on each line.
    supabase
      .from("parts")
      .select("id, internal_sku, name_en, service_part_type_id, base_part_id")
      .not("service_part_type_id", "is", null)
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
  ]);

  const items = itemsRes.data ?? [];

  // Pricing: live estimate from the current list while planned; frozen
  // snapshots once sent.
  const priced = isPlanned
    ? priceOrderItems(
        { items: priceList?.items ?? [] },
        items.map((i) => ({
          id: i.id,
          service_part_type_id: i.service_part_type_id,
          quantity: i.quantity,
        })),
      )
    : null;

  const itemRows: ServiceOrderItemRow[] = items.map((i) => {
    const base = {
      id: i.id,
      partTypeId: i.service_part_type_id,
      partTypeName: i.part_type
        ? localizedName(locale, i.part_type.name_en, i.part_type.name_da)
        : "—",
      partId: one(i.named_part)?.id ?? null,
      partLabel: one(i.named_part)
        ? `${one(i.named_part)!.internal_sku} · ${one(i.named_part)!.name_en}`
        : null,
      quantity: i.quantity,
      colorId: i.color?.id ?? null,
      colorName: i.color
        ? localizedName(locale, i.color.name_en, i.color.name_da)
        : null,
      colorHex: i.color?.hex ?? null,
      colorFinish: i.color
        ? colorFinishLabel(
            i.color.ral_code,
            i.color.coating,
            locale === "da" ? "da" : "en",
          )
        : null,
      notes: i.notes,
    };
    if (isPlanned) {
      const resolved = priced?.byItemId.get(i.id) ?? null;
      return {
        ...base,
        unitPriceLabel: resolved
          ? formatPrice(resolved.item.unit_price, priceList!.currency)
          : null,
        lineTotalLabel: resolved
          ? formatPrice(resolved.lineTotal, priceList!.currency)
          : null,
        tierBadge: resolved ? tierLabel(resolved.item) : null,
        supplierItemNo: resolved?.item.supplier_item_no ?? null,
      };
    }
    const unitPrice = i.unit_price == null ? null : Number(i.unit_price);
    return {
      ...base,
      unitPriceLabel:
        unitPrice == null ? null : formatPrice(unitPrice, i.currency),
      lineTotalLabel:
        unitPrice == null
          ? null
          : formatPrice(unitPrice * i.quantity, i.currency),
      tierBadge: null,
      supplierItemNo: i.supplier_item_no,
    };
  });

  // Footer total: single figure while planned (list currency); per-currency
  // sum from snapshots after (never blend magnitudes across currencies).
  let totalLabel: string | null = null;
  let unpricedCount = 0;
  if (isPlanned) {
    unpricedCount = priced?.unpricedCount ?? 0;
    if (priced && priced.total > 0 && priceList) {
      totalLabel = formatPrice(priced.total, priceList.currency);
    }
  } else {
    const byCurrency = new Map<string, number>();
    for (const i of items) {
      if (i.unit_price == null || !i.currency) continue;
      const cur = i.currency;
      byCurrency.set(
        cur,
        (byCurrency.get(cur) ?? 0) + Number(i.unit_price) * i.quantity,
      );
    }
    totalLabel =
      byCurrency.size === 0
        ? null
        : [...byCurrency.entries()]
            .map(([cur, amt]) => formatPrice(amt, cur))
            .join(" + ");
  }

  const linkData = (linkRes.data ?? []).filter((r) => r.bike != null);
  const bikeRows: PaintOrderBikeRow[] = linkData.map((r) => {
    const tpl = r.bike?.template;
    const templateLabel = tpl
      ? [tpl.family?.name, tpl.frame_size, tpl.name_en]
          .filter(Boolean)
          .join(" · ")
      : null;
    return {
      bikeId: r.bike?.id ?? "",
      frameNumber: r.bike?.frame_number ?? "",
      status: (r.bike?.status ?? "planning") as BikeStatus,
      templateLabel,
      addedAt: r.added_at,
      notes: r.notes,
      legacyColorName: r.color
        ? localizedName(locale, r.color.name_en, r.color.name_da)
        : null,
      legacyColorHex: r.color?.hex ?? null,
      legacyScopeLabel: r.scope
        ? (LEGACY_SCOPE_LABEL[r.scope] ?? r.scope)
        : null,
    };
  });

  const colors = (colorsRes.data ?? []) as ColorOption[];

  // A bike is ineligible while it's in an open order of a build-blocking
  // type (same semantics as the at-supplier gate).
  const inOpenOrder = new Set(
    (openLinksRes.data ?? [])
      .filter(
        (r) => one(one(r.service_order)?.service_type)?.blocks_build === true,
      )
      .map((r) => r.bike_id),
  );
  const orgLabel = (
    o:
      | {
          legal_name: string;
          display_name_en: string | null;
          display_name_da: string | null;
        }
      | null
      | undefined,
  ) =>
    o
      ? ((locale === "da"
          ? (o.display_name_da ?? o.display_name_en)
          : (o.display_name_en ?? o.display_name_da)) ?? o.legal_name)
      : null;
  const eligibleBikes: EligibleBikeOption[] = (allBikesRes.data ?? [])
    .filter((b) => !inOpenOrder.has(b.id))
    .map((b) => {
      const tpl = b.template;
      const templateLabel = tpl
        ? [tpl.family?.name, tpl.frame_size, tpl.name_en]
            .filter(Boolean)
            .join(" · ")
        : null;
      const mo = one(b.manufacturing_order);
      const so = mo ? one(mo.sales_order) : null;
      return {
        id: b.id,
        frameNumber: b.frame_number,
        templateLabel,
        status: b.status as BikeStatus,
        moNumber: mo?.mo_number ?? null,
        soId: so?.id ?? null,
        soNumber: so?.sales_order_number ?? null,
        customerName:
          orgLabel(so ? one(so.organization) : null) ??
          orgLabel(one(b.owner_organization)),
      };
    });

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
              <Link href="/paint-orders">{tPo("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">
              {order.order_number}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PaintOrderHeader
        serviceOrderId={order.id}
        orderNumber={order.order_number}
        status={order.status as ServiceOrderStatus}
        supplierId={order.supplier?.id ?? null}
        supplierName={order.supplier?.name ?? null}
        emailedAt={order.emailed_at}
        emailedTo={order.emailed_to}
        emailTestMode={settingsRes.data?.outbound_test_mode ?? true}
        emailTestRecipients={settingsRes.data?.outbound_test_email ?? null}
        supplierEmails={[
          order.supplier?.email_primary,
          order.supplier?.email_secondary,
        ].filter((e): e is string => Boolean(e))}
        supplierDefaultMessage={order.supplier?.default_email_message ?? null}
        colorName={
          order.color
            ? localizedName(locale, order.color.name_en, order.color.name_da)
            : null
        }
        colorHex={order.color?.hex ?? null}
        colorFinish={
          order.color
            ? colorFinishLabel(
                order.color.ral_code,
                order.color.coating,
                locale === "da" ? "da" : "en",
              )
            : null
        }
      />

      <Section title={t("detailsTitle")} description={t("detailsDesc")}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label={t("fieldSupplier")}>
            {order.supplier?.name ?? <Muted>—</Muted>}
          </Field>
          <Field label={t("fieldBatchColour")}>
            {order.color ? (
              <span className="flex flex-col gap-0.5">
                <ColorChip
                  hex={order.color.hex}
                  label={localizedName(
                    locale,
                    order.color.name_en,
                    order.color.name_da,
                  )}
                />
                {colorFinishLabel(
                  order.color.ral_code,
                  order.color.coating,
                  locale === "da" ? "da" : "en",
                ) ? (
                  <span className="text-muted-foreground text-xs">
                    {colorFinishLabel(
                      order.color.ral_code,
                      order.color.coating,
                      locale === "da" ? "da" : "en",
                    )}
                  </span>
                ) : null}
              </span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label={t("fieldSalesOrder")}>
            {order.sales_order ? (
              <Link
                href={`/sales-orders/${order.sales_order.id}`}
                className="font-mono hover:underline"
              >
                {order.sales_order.sales_order_number}
              </Link>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label={t("fieldPlannedSend")}>
            {order.planned_send_date ?? <Muted>—</Muted>}
          </Field>
          <Field label={t("fieldSent")}>
            {order.sent_at ? formatDateTime(order.sent_at) : <Muted>—</Muted>}
          </Field>
          <Field label={t("fieldExpectedReturn")}>
            {order.expected_return_at ? (
              formatDateTime(order.expected_return_at)
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label={t("fieldReceivedBack")}>
            {order.received_at ? (
              formatDateTime(order.received_at)
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("fieldNotes")}>
              {order.notes ? (
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {order.notes}
                </pre>
              ) : (
                <Muted>—</Muted>
              )}
            </Field>
          </div>
        </dl>
      </Section>

      <ServiceOrderItemsSection
        serviceOrderId={order.id}
        orderStatus={order.status}
        attachedBikes={bikeRows.length}
        rows={itemRows}
        partTypes={partTypes}
        paintableParts={(paintablePartsRes.data ?? []).map((p) => ({
          id: p.id,
          sku: p.internal_sku,
          name: p.name_en,
          servicePartTypeId: p.service_part_type_id as string,
          isVariant: p.base_part_id != null,
        }))}
        colors={colors}
        defaultColorId={order.color?.id ?? null}
        totalLabel={totalLabel}
        totalIsEstimate={isPlanned}
        unpricedCount={unpricedCount}
        priceListName={priceList?.name ?? null}
      />

      <PaintOrderBikesSection
        serviceOrderId={order.id}
        orderStatus={order.status}
        rows={bikeRows}
        eligibleBikes={eligibleBikes}
      />

      {/* What the painter actually received, kept verbatim (migration 94).
          Prices freeze at send, but the message typed in the dialog lived
          nowhere until now — and a refused send left no trace at all. */}
      <Section title={tOutbox("title")} description={tOutbox("panelDesc")}>
        <OutboundMessageList rows={sentMessages} />
      </Section>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
