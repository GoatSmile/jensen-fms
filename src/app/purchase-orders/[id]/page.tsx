import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/parts/format";
import {
  PO_STATUS_VARIANT,
  poStatusLabel,
  type PurchaseOrderStatus,
} from "@/lib/po/status";

import {
  ReceiveForm,
  type LineRow,
  type LocationOption,
} from "./_components/receive-form";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [poRes, linesRes, locationsRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        `
          id, po_number, status, order_date, expected_date, received_date,
          total_amount, total_currency, notes,
          suppliers(id, name)
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("purchase_order_lines")
      .select(
        `
          id, quantity, received_quantity, unit_price, currency,
          fx_rate_to_dkk, transport_factor, landed_cost_dkk_per_unit,
          parts(id, internal_sku, name_en)
        `,
      )
      .eq("purchase_order_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id, code, name_en")
      .eq("is_active", true)
      .order("code", { ascending: true }),
  ]);

  if (poRes.error) {
    throw new Error(`Failed to load PO: ${poRes.error.message}`);
  }
  if (!poRes.data) notFound();
  if (linesRes.error) {
    throw new Error(`Failed to load lines: ${linesRes.error.message}`);
  }

  const po = poRes.data;

  const lineRows: LineRow[] = (linesRes.data ?? []).map((l) => ({
    id: l.id,
    partId: l.parts?.id ?? "",
    partSku: l.parts?.internal_sku ?? "—",
    partName: l.parts?.name_en ?? "—",
    quantity: Number(l.quantity),
    receivedQuantity: Number(l.received_quantity),
    unitPrice: Number(l.unit_price),
    currency: l.currency,
    landedDkkPerUnit: Number(l.landed_cost_dkk_per_unit ?? 0),
  }));

  const locationOptions: LocationOption[] = (locationsRes.data ?? []).map(
    (l) => ({ id: l.id, code: l.code, name: l.name_en }),
  );

  const totalOrdered = lineRows.reduce((s, l) => s + l.quantity, 0);
  const totalReceived = lineRows.reduce((s, l) => s + l.receivedQuantity, 0);

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
              <Link href="/purchase-orders">Purchase orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{po.po_number}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-xs">
                {po.po_number}
              </span>
              <Badge
                variant={
                  PO_STATUS_VARIANT[po.status as PurchaseOrderStatus] ??
                  "outline"
                }
              >
                {poStatusLabel(po.status)}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {po.suppliers?.name ?? "—"}
            </h1>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label="Ordered">{formatDate(po.order_date)}</Stat>
          <Stat label="Expected">{formatDate(po.expected_date)}</Stat>
          <Stat label="Received">{formatDate(po.received_date)}</Stat>
          <Stat label="Total">
            <span className="tabular-nums">
              {formatMoney(
                po.total_amount != null ? Number(po.total_amount) : null,
                po.total_currency,
              )}
            </span>
          </Stat>
          <Stat label="Lines">{lineRows.length}</Stat>
          <Stat label="Units ordered" className="tabular-nums">
            {totalOrdered}
          </Stat>
          <Stat label="Units received" className="tabular-nums">
            {totalReceived}
          </Stat>
          <Stat label="Outstanding" className="tabular-nums">
            {totalOrdered - totalReceived}
          </Stat>
        </dl>

        {po.notes ? (
          <p className="text-muted-foreground text-sm">{po.notes}</p>
        ) : null}
      </header>

      <ReceiveForm
        poId={po.id}
        poStatus={po.status}
        lines={lineRows}
        locations={locationOptions}
      />
    </div>
  );
}

function Stat({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd className={className}>{children}</dd>
    </div>
  );
}
