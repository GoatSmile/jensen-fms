import Link from "next/link";
import { Field } from "@/components/field";
import { notFound } from "next/navigation";

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
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import type { BikeStatus } from "@/lib/bikes/status";
import type { PaintOrderStatus } from "@/lib/paint/status";
import { resolveLakSkus } from "@/lib/paint/scope";
import type { ColorOption } from "@/app/paint-orders/_components/paint-order-form";

import type { EligibleBikeOption } from "./_components/add-bike-to-paint-dialog";
import { PaintOrderBikesSection } from "./_components/paint-order-bikes-section";
import type { PaintOrderBikeRow } from "./_components/paint-order-bikes-section";
import { PaintOrderHeader } from "./_components/paint-order-header";
import { Section } from "./_components/section";

const OPEN_STATUSES: PaintOrderStatus[] = [
  "planned",
  "sent_to_painter",
  "at_painter",
];

export default async function PaintOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const orderRes = await supabase
    .from("paint_orders")
    .select(
      `
        id, paint_order_number, status,
        planned_send_date, sent_at, expected_return_at, received_at,
        unit_cost, unit_cost_currency, notes, created_at,
        supplier:suppliers(id, name),
        color:colors(id, slug, name_en, hex, ral_code, coating),
        paint_part:parts(id, internal_sku, name_en),
        sales_order:sales_orders!sales_order_id(id, sales_order_number)
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (orderRes.error) {
    throw new Error(`Failed to load paint order: ${orderRes.error.message}`);
  }
  if (!orderRes.data) notFound();
  const order = orderRes.data;

  // Bikes in this order (+ per-line colour/scope), the picker's eligible bikes,
  // the colour list for the pickers, and JP-lak prices for auto-costing — one
  // round-trip. Eligible = non-deleted bikes NOT in an open order (PostgREST
  // can't NOT-IN a subquery, so we filter client-side).
  const [linkRes, allBikesRes, openLinksRes, colorsRes, lakRes] =
    await Promise.all([
      supabase
        .from("paint_order_bikes")
        .select(
          `
            bike_id, added_at, notes, color_id, scope,
            color:colors(id, name_en, hex, ral_code, coating),
            bike:bikes(
              id, frame_number, status,
              template:bike_templates(id, name_en, family, frame_size, version)
            )
          `,
        )
        .eq("paint_order_id", id)
        .order("added_at", { ascending: true }),
      supabase
        .from("bikes")
        .select(
          `
            id, frame_number,
            template:bike_templates(id, name_en, family, frame_size)
          `,
        )
        .is("deleted_at", null)
        .order("frame_number", { ascending: true }),
      supabase
        .from("paint_order_bikes")
        .select(
          `
            bike_id,
            paint_order:paint_orders!inner(status)
          `,
        )
        .in("paint_order.status", OPEN_STATUSES),
      supabase
        .from("colors")
        .select("id, name_en, hex, ral_code, coating")
        .eq("is_active", true)
        .order("name_en", { ascending: true }),
      supabase
        .from("parts")
        .select("internal_sku, default_retail_price, default_retail_currency")
        .like("internal_sku", "JP-lak%"),
    ]);

  // JP-lak per-bike price by SKU (auto-pricing lookup).
  const lakMap = new Map<
    string,
    { price: number | null; currency: string | null }
  >();
  for (const p of lakRes.data ?? []) {
    lakMap.set(p.internal_sku, {
      price:
        p.default_retail_price == null ? null : Number(p.default_retail_price),
      currency: p.default_retail_currency,
    });
  }

  const linkData = (linkRes.data ?? []).filter((r) => r.bike != null);
  const bikeCount = linkData.length;

  // Sum per currency so a stray non-DKK JP-lak price never gets blended into a
  // single mislabelled total (JP-lak should be DKK, but the price is free-form).
  const totalsByCurrency = new Map<string, number>();

  const bikeRows: PaintOrderBikeRow[] = linkData.map((r) => {
    const tpl = r.bike?.template;
    const templateLabel = tpl
      ? [tpl.family, tpl.frame_size, tpl.name_en].filter(Boolean).join(" · ")
      : null;
    // svaj is an add-on SKU, so a line's cost can span several SKUs — sum
    // them per currency, and flag with "+ ?" if a component SKU is unpriced
    // (a silently partial figure is exactly the historical 60.000 kr trap).
    const lakSkus = resolveLakSkus(r.scope, bikeCount);
    const lineByCurrency = new Map<string, number>();
    let unpriced = false;
    for (const sku of lakSkus ?? []) {
      const lak = lakMap.get(sku);
      if (lak?.price == null) {
        unpriced = true;
        continue;
      }
      const cur = lak.currency ?? "DKK";
      lineByCurrency.set(cur, (lineByCurrency.get(cur) ?? 0) + lak.price);
      totalsByCurrency.set(cur, (totalsByCurrency.get(cur) ?? 0) + lak.price);
    }
    const lakPriceLabel =
      lineByCurrency.size === 0
        ? null
        : [...lineByCurrency.entries()]
            .map(([cur, amt]) => formatPrice(amt, cur))
            .join(" + ") + (unpriced ? " + ?" : "");
    return {
      bikeId: r.bike?.id ?? "",
      frameNumber: r.bike?.frame_number ?? "",
      status: (r.bike?.status ?? "planning") as BikeStatus,
      templateLabel,
      addedAt: r.added_at,
      notes: r.notes,
      colorId: r.color_id ?? null,
      colorName: r.color?.name_en ?? null,
      colorHex: r.color?.hex ?? null,
      colorFinish: r.color
        ? colorFinishLabel(r.color.ral_code, r.color.coating)
        : null,
      scope: r.scope ?? null,
      lakSku: lakSkus?.join(" + ") ?? null,
      lakPriceLabel,
    };
  });

  // One currency → a plain total; multiple → a per-currency breakdown joined
  // with " + " (never a single blended magnitude under one label).
  const orderTotalLabel =
    totalsByCurrency.size === 0
      ? null
      : [...totalsByCurrency.entries()]
          .map(([cur, amt]) => formatPrice(amt, cur))
          .join(" + ");
  const colors = (colorsRes.data ?? []) as ColorOption[];

  const inOpenOrder = new Set((openLinksRes.data ?? []).map((r) => r.bike_id));
  const eligibleBikes: EligibleBikeOption[] = (allBikesRes.data ?? [])
    .filter((b) => !inOpenOrder.has(b.id))
    .map((b) => {
      const tpl = b.template;
      const templateLabel = tpl
        ? [tpl.family, tpl.frame_size, tpl.name_en].filter(Boolean).join(" · ")
        : null;
      return {
        id: b.id,
        frameNumber: b.frame_number,
        templateLabel,
      };
    });

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
              <Link href="/paint-orders">Paint orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{order.paint_order_number}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PaintOrderHeader
        paintOrderId={order.id}
        paintOrderNumber={order.paint_order_number}
        status={order.status as PaintOrderStatus}
        supplierName={order.supplier?.name ?? null}
        colorName={order.color?.name_en ?? null}
        colorHex={order.color?.hex ?? null}
        colorFinish={
          order.color
            ? colorFinishLabel(order.color.ral_code, order.color.coating)
            : null
        }
      />

      <Section
        title="Details"
        description="Supplier, costing, and round-trip timestamps."
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Supplier">
            {order.supplier?.name ?? <Muted>—</Muted>}
          </Field>
          <Field label="Colour">
            {order.color ? (
              <span className="flex flex-col gap-0.5">
                <ColorChip hex={order.color.hex} label={order.color.name_en} />
                {colorFinishLabel(
                  order.color.ral_code,
                  order.color.coating,
                ) ? (
                  <span className="text-muted-foreground text-xs">
                    {colorFinishLabel(order.color.ral_code, order.color.coating)}
                  </span>
                ) : null}
              </span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Catalog part">
            {order.paint_part ? (
              <Link
                href={`/parts/${order.paint_part.id}`}
                className="hover:underline"
              >
                {order.paint_part.name_en}{" "}
                <span className="text-muted-foreground font-mono text-xs">
                  ({order.paint_part.internal_sku})
                </span>
              </Link>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Sales order">
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
          <Field label="Unit cost (per bike)">
            <span className="tabular-nums">
              {formatPrice(
                order.unit_cost == null ? null : Number(order.unit_cost),
                order.unit_cost_currency,
              )}
            </span>
          </Field>
          <Field label="Planned send date">
            {order.planned_send_date ?? <Muted>—</Muted>}
          </Field>
          <Field label="Sent">
            {order.sent_at ? formatDateTime(order.sent_at) : <Muted>—</Muted>}
          </Field>
          <Field label="Expected return">
            {order.expected_return_at ? (
              formatDateTime(order.expected_return_at)
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Received back">
            {order.received_at ? (
              formatDateTime(order.received_at)
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
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

      <PaintOrderBikesSection
        paintOrderId={order.id}
        paintOrderStatus={order.status}
        rows={bikeRows}
        eligibleBikes={eligibleBikes}
        colors={colors}
        defaultColorId={order.color?.id ?? null}
        orderTotalLabel={orderTotalLabel}
      />
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
