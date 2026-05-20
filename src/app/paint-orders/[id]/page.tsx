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
import { ColorChip } from "@/components/color-swatch";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import type { BikeStatus } from "@/lib/bikes/status";
import type { PaintOrderStatus } from "@/lib/paint/status";

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
        color:colors(id, slug, name_en, hex),
        paint_part:parts(id, internal_sku, name_en)
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (orderRes.error) {
    throw new Error(`Failed to load paint order: ${orderRes.error.message}`);
  }
  if (!orderRes.data) notFound();
  const order = orderRes.data;

  // Bikes currently in this paint order.
  const linkRes = await supabase
    .from("paint_order_bikes")
    .select(
      `
        bike_id, added_at, notes,
        bike:bikes(
          id, frame_number, status,
          template:bike_templates(id, name_en, family, frame_size, version)
        )
      `,
    )
    .eq("paint_order_id", id)
    .order("added_at", { ascending: true });

  const bikeRows: PaintOrderBikeRow[] = (linkRes.data ?? [])
    .filter((r) => r.bike != null)
    .map((r) => {
      const tpl = r.bike?.template;
      const templateLabel = tpl
        ? [tpl.family, tpl.frame_size, tpl.name_en].filter(Boolean).join(" · ")
        : null;
      return {
        bikeId: r.bike?.id ?? "",
        frameNumber: r.bike?.frame_number ?? "",
        status: (r.bike?.status ?? "planning") as BikeStatus,
        templateLabel,
        addedAt: r.added_at,
        notes: r.notes,
      };
    });

  // Eligible bikes for the picker: any non-deleted bike NOT currently in an
  // open paint order. PostgREST can't NOT-IN a subquery, so we fetch the list
  // of bike_ids that are in open orders separately and filter client-side.
  const [allBikesRes, openLinksRes] = await Promise.all([
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
  ]);

  const inOpenOrder = new Set(
    (openLinksRes.data ?? []).map((r) => r.bike_id),
  );
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
    <div className="flex flex-1 flex-col gap-6 p-6">
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
            <BreadcrumbPage>{order.paint_order_number}</BreadcrumbPage>
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
              <ColorChip hex={order.color.hex} label={order.color.name_en} />
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
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
