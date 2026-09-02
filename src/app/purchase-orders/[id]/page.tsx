import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { localizedName } from "@/i18n/vocab";
import { Money } from "@/components/money";
import { SegmentedId } from "@/components/segmented-id";
import { formatDate } from "@/lib/parts/format";
import type { PurchaseOrderStatus } from "@/lib/po/status";
import type { ImportTaxBasis, PartOrigin } from "@/lib/purchasing/import-tax";

import { POHeader } from "./_components/po-header";
import { LinesSection, type POLineRow } from "./_components/lines-section";
import type { CurrencyChoice, PartChoice } from "./_components/line-dialog";
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
  const [t, tPo, tCommon, locale] = await Promise.all([
    getTranslations("poDetail"),
    getTranslations("po"),
    getTranslations("common"),
    getLocale(),
  ]);
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
          total_amount, total_currency, notes, emailed_at, emailed_to,
          suppliers(id, name, import_duty_prepaid_default, email_primary, email_secondary, default_email_message)
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("purchase_order_lines")
      .select(
        `
          id, quantity, received_quantity, unit_price, currency,
          fx_rate_to_dkk, transport_pct, tariff_pct, anti_dumping_pct,
          import_tax_basis, landed_cost_dkk_per_unit, notes,
          parts(id, internal_sku, name_en)
        `,
      )
      .eq("purchase_order_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id, code, name_en, name_da")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("parts")
      .select(
        `id, internal_sku, name_en, origin, tariff_pct_override,
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
      .select(
        "default_transport_pct, hide_location_info, primary_location_id, outbound_test_mode, outbound_test_email",
      )
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
    unitPrice: l.unit_price == null ? null : Number(l.unit_price),
    currency: l.currency,
    fxRateToDkk: Number(l.fx_rate_to_dkk),
    transportPct: Number(l.transport_pct),
    tariffPct: Number(l.tariff_pct ?? 0),
    antiDumpingPct: Number(l.anti_dumping_pct ?? 0),
    // DB CHECK constrains the vocab; narrow the generated string type.
    importTaxBasis: (l.import_tax_basis ?? null) as ImportTaxBasis | null,
    landedDkkPerUnit:
      l.landed_cost_dkk_per_unit == null
        ? null
        : Number(l.landed_cost_dkk_per_unit),
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
    unitPrice: l.unit_price == null ? null : Number(l.unit_price),
    currency: l.currency,
    landedDkkPerUnit:
      l.landed_cost_dkk_per_unit == null
        ? null
        : Number(l.landed_cost_dkk_per_unit),
  }));

  const locationOptions: LocationOption[] = (locationsRes.data ?? []).map(
    (l) => ({
      id: l.id,
      code: l.code,
      name: localizedName(locale, l.name_en, l.name_da),
    }),
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
    // Mirror the server-side snapshot resolution (po-snapshots.ts): a
    // part-level tariff override beats the HS code, so the dialog preview
    // matches what a save will freeze onto the line.
    const hasOverride = p.tariff_pct_override != null;
    return {
      id: p.id,
      internal_sku: p.internal_sku,
      name_en: p.name_en,
      hsCode: active ? (hs?.code ?? null) : null,
      tariffPct: hasOverride
        ? Number(p.tariff_pct_override)
        : active
          ? Number(hs?.tariff_pct ?? 0)
          : 0,
      antiDumpingPct: active ? Number(hs?.anti_dumping_pct ?? 0) : 0,
      origin: (p.origin ?? null) as PartOrigin | null,
    };
  });

  const currencies: CurrencyChoice[] = currenciesRes.data ?? [];

  const defaultTransportPct = Number(
    settingsRes.data?.default_transport_pct ?? 0.1,
  );
  const hideLocations = settingsRes.data?.hide_location_info ?? false;
  const primaryLocationId = settingsRes.data?.primary_location_id ?? null;

  const totalOrdered = poLineRows.reduce((s, l) => s + l.quantity, 0);
  const totalReceived = poLineRows.reduce((s, l) => s + l.receivedQuantity, 0);
  // Landed total in DKK from the lines (matches the list / v_po_totals):
  // includes transport, tariff and anti-dumping, unified across currencies.
  // Partial total over priced lines only — unpriced lines (NULL landed cost)
  // are skipped, matching v_po_totals' SUM(). Stays null until at least one
  // line has a price, so the header shows "—" instead of a misleading 0,00 kr.
  let landedTotalDkk: number | null = null;
  for (const l of poLineRows) {
    if (l.landedDkkPerUnit == null) continue;
    landedTotalDkk = (landedTotalDkk ?? 0) + l.quantity * l.landedDkkPerUnit;
  }

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
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/purchase-orders">{tPo("title")}</Link>
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
        emailedAt={po.emailed_at ?? null}
        emailedTo={po.emailed_to ?? null}
        emailTestMode={settingsRes.data?.outbound_test_mode ?? true}
        emailTestRecipients={settingsRes.data?.outbound_test_email ?? null}
        supplierEmails={[
          po.suppliers?.email_primary,
          po.suppliers?.email_secondary,
        ].filter((e): e is string => Boolean(e))}
        supplierDefaultMessage={po.suppliers?.default_email_message ?? null}
      />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label={t("statOrdered")}>{formatDate(po.order_date)}</Stat>
        <Stat label={t("statExpected")}>{formatDate(po.expected_date)}</Stat>
        <Stat label={t("statReceived")}>{formatDate(po.received_date)}</Stat>
        <Stat label={t("statOrderTotal")}>
          <Money
            amount={po.total_amount != null ? Number(po.total_amount) : null}
            currency={po.total_currency}
          />
        </Stat>
        <Stat label={t("statLandedTotal")}>
          <Money
            amount={poLineRows.length > 0 ? landedTotalDkk : null}
            currency="DKK"
          />
        </Stat>
        <Stat label={t("statLines")}>{poLineRows.length}</Stat>
        <Stat label={t("statUnitsOrdered")} className="tabular-nums">
          {totalOrdered}
        </Stat>
        <Stat label={t("statUnitsReceived")} className="tabular-nums">
          {totalReceived}
        </Stat>
        <Stat label={t("statOutstanding")} className="tabular-nums">
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
        supplierDutyPrepaid={po.suppliers?.import_duty_prepaid_default ?? false}
      />

      {showReceiveForm ? (
        <ReceiveForm
          poId={po.id}
          poStatus={po.status}
          lines={receiveLineRows}
          locations={locationOptions}
          hideLocation={hideLocations}
          primaryLocationId={primaryLocationId}
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
