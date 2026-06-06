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
import { createClient } from "@/lib/supabase/server";
import { Money } from "@/components/money";
import { SegmentedId } from "@/components/segmented-id";
import { formatDate } from "@/lib/parts/format";
import type { PurchaseOrderStatus } from "@/lib/po/status";

import { POHeader } from "./_components/po-header";
import {
  LinesSection,
  type POLineRow,
} from "./_components/lines-section";
import type {
  CurrencyChoice,
  PartChoice,
} from "./_components/line-dialog";
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

  const [
    poRes,
    linesRes,
    locationsRes,
    partsCatalogRes,
    currenciesRes,
    fxRatesRes,
    settingsRes,
  ] = await Promise.all([
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
          fx_rate_to_dkk, transport_pct, tariff_pct, anti_dumping_pct, landed_cost_dkk_per_unit, notes,
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
    supabase
      .from("parts")
      .select(
        `id, internal_sku, name_en,
         hs_code:hs_codes!hs_code_id(code, tariff_pct, anti_dumping_pct, is_active)`,
      )
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
    supabase
      .from("currencies")
      .select("code, name_en")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    // Pull every from_currency → DKK rate; we collapse to the latest per
    // currency in JS rather than relying on a window function.
    supabase
      .from("fx_rates")
      .select("from_currency, to_currency, rate, rate_date")
      .eq("to_currency", "DKK")
      .order("rate_date", { ascending: false }),
    supabase
      .from("app_settings")
      .select("default_transport_pct")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (poRes.error) {
    throw new Error(`Failed to load PO: ${poRes.error.message}`);
  }
  if (!poRes.data) notFound();
  if (linesRes.error) {
    throw new Error(`Failed to load lines: ${linesRes.error.message}`);
  }

  const po = poRes.data;
  const status = po.status as PurchaseOrderStatus;

  // POLineRow for the new lines section (with full FX/transport/tariff cols).
  const poLineRows: POLineRow[] = (linesRes.data ?? []).map((l) => ({
    id: l.id,
    partId: l.parts?.id ?? "",
    partSku: l.parts?.internal_sku ?? "—",
    partName: l.parts?.name_en ?? "—",
    quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price),
    currency: l.currency,
    fxRateToDkk: Number(l.fx_rate_to_dkk),
    transportPct: Number(l.transport_pct),
    tariffPct: Number(l.tariff_pct ?? 0),
    antiDumpingPct: Number(l.anti_dumping_pct ?? 0),
    landedDkkPerUnit: Number(l.landed_cost_dkk_per_unit ?? 0),
    receivedQuantity: Number(l.received_quantity),
    notes: l.notes,
  }));

  // The receive form only needs the slim shape.
  const receiveLineRows: LineRow[] = (linesRes.data ?? []).map((l) => ({
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

  // Latest fx_rates row per from_currency. Rows are already sorted desc by
  // rate_date, so the first occurrence we see is the freshest.
  const fxRatesByCurrency: Record<string, number> = {};
  for (const r of fxRatesRes.data ?? []) {
    if (r.from_currency in fxRatesByCurrency) continue;
    fxRatesByCurrency[r.from_currency] = Number(r.rate);
  }

  const partsCatalog: PartChoice[] = (partsCatalogRes.data ?? []).map((p) => {
    const hs = p.hs_code;
    const active = hs?.is_active ?? false;
    return {
      id: p.id,
      internal_sku: p.internal_sku,
      name_en: p.name_en,
      hsCode: active ? (hs?.code ?? null) : null,
      tariffPct: active ? Number(hs?.tariff_pct ?? 0) : 0,
      antiDumpingPct: active ? Number(hs?.anti_dumping_pct ?? 0) : 0,
    };
  });

  const currencies: CurrencyChoice[] = currenciesRes.data ?? [];

  const defaultTransportPct = Number(
    settingsRes.data?.default_transport_pct ?? 0.10,
  );

  const totalOrdered = poLineRows.reduce((s, l) => s + l.quantity, 0);
  const totalReceived = poLineRows.reduce(
    (s, l) => s + l.receivedQuantity,
    0,
  );

  // The receive form should only render when the PO is mid-flight. Drafts
  // can't be received against (no order placed yet); cancelled/received
  // POs are terminal.
  const showReceiveForm =
    status === "placed" || status === "partially_received";

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
            <BreadcrumbPage>
              <SegmentedId value={po.po_number} />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <POHeader
        poId={po.id}
        poNumber={po.po_number}
        status={status}
        supplierName={po.suppliers?.name ?? null}
        supplierId={po.suppliers?.id ?? null}
      />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label="Ordered">{formatDate(po.order_date)}</Stat>
        <Stat label="Expected">{formatDate(po.expected_date)}</Stat>
        <Stat label="Received">{formatDate(po.received_date)}</Stat>
        <Stat label="Total">
          <Money
            amount={
              po.total_amount != null ? Number(po.total_amount) : null
            }
            currency={po.total_currency}
          />
        </Stat>
        <Stat label="Lines">{poLineRows.length}</Stat>
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
        <p className="text-muted-foreground whitespace-pre-wrap text-sm">
          {po.notes}
        </p>
      ) : null}

      <LinesSection
        poId={po.id}
        status={status}
        orderDate={po.order_date}
        totalCurrency={po.total_currency}
        rows={poLineRows}
        partsCatalog={partsCatalog}
        currencies={currencies}
        fxRatesByCurrency={fxRatesByCurrency}
        defaultTransportPct={defaultTransportPct}
      />

      {showReceiveForm ? (
        <ReceiveForm
          poId={po.id}
          poStatus={po.status}
          lines={receiveLineRows}
          locations={locationOptions}
        />
      ) : null}
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
