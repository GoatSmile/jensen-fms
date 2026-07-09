import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CircleCheck,
  TrendingUp,
} from "lucide-react";

import {
  AttentionCard,
  PipelineCard,
} from "@/components/dashboard-card";
import { FoldSection } from "@/components/dashboard/fold-section";
import {
  BikesTrendChart,
  InvoicedTrendChart,
  PurchasingTrendChart,
  type TrendMonth,
} from "@/components/dashboard/trend-charts";
import { Badge } from "@/components/ui/badge";
import {
  loadHousekeeping,
  loadMoneyBand,
  loadMonthlyStats,
  loadPipelines,
  loadPurchasingTrend,
} from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";
import { OPEN_MO_STATUSES } from "@/lib/mo/status";
import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/parts/format";
import { createClient } from "@/lib/supabase/server";

const AGING_PAINT_STATUSES = ["sent_to_painter", "at_painter"] as const;
const PAINT_AGING_DAYS = 14;
const ATTENTION_LIMIT = 5;

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function diffDays(fromISO: string): number {
  const ms = Date.now() - Date.parse(fromISO);
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** "Aug" for most months, "Jan 26" where the year flips — chart tick labels. */
function trendLabel(monthStart: string): string {
  const d = new Date(`${monthStart}T00:00:00Z`);
  const m = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return d.getUTCMonth() === 0
    ? `${m} ${String(d.getUTCFullYear()).slice(2)}`
    : m;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** One clickable row inside a money-band card, matching the attention-list rows. */
function BandRow({
  href,
  right,
  rightClassName,
  children,
}: {
  href: string;
  right?: string;
  rightClassName?: string;
  children: ReactNode;
}) {
  return (
    <li className="text-sm">
      <Link
        href={href}
        className="hover:bg-muted/50 -mx-1.5 flex items-center justify-between gap-2 rounded px-1.5 py-1 transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">{children}</span>
        {right ? (
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              rightClassName ?? "text-muted-foreground",
            )}
          >
            {right}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = todayISODate();
  const paintCutoff = daysAgo(PAINT_AGING_DAYS);

  const [
    partsCount,
    customersCount,
    lowStockRes,
    overdueMOsRes,
    paintAgingRes,
    costBasisRes,
    moneyBand,
    monthlyStats,
    pipelines,
    purchasing,
    housekeeping,
  ] = await Promise.all([
    supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .is("deleted_at", null),
    // Top short parts. v_parts_dashboard already classifies stock_status.
    supabase
      .from("v_parts_dashboard")
      .select(
        "id, internal_sku, name_en, stock_on_hand, reorder_point, stock_status",
      )
      .in("stock_status", ["out", "low"])
      .is("deleted_at", null)
      .order("stock_on_hand", { ascending: true })
      .limit(ATTENTION_LIMIT),
    supabase
      .from("manufacturing_orders")
      .select("id, mo_number, planned_completion_date, status")
      .in("status", OPEN_MO_STATUSES)
      .not("planned_completion_date", "is", null)
      .lt("planned_completion_date", today)
      .order("planned_completion_date", { ascending: true })
      .limit(ATTENTION_LIMIT),
    supabase
      .from("paint_orders")
      .select(
        "id, paint_order_number, sent_at, status, supplier:suppliers(id, name)",
      )
      .in("status", AGING_PAINT_STATUSES)
      .not("sent_at", "is", null)
      .lt("sent_at", paintCutoff)
      .order("sent_at", { ascending: true })
      .limit(ATTENTION_LIMIT),
    // Catalog cost basis = SUM(stock_on_hand * last_cost_dkk). The view is
    // small enough (~hundreds of rows at scale) that app-side aggregation
    // is fine; if it ever blows up, push it into an RPC.
    supabase
      .from("v_parts_dashboard")
      .select("stock_on_hand, last_cost_dkk")
      .is("deleted_at", null)
      .not("last_cost_dkk", "is", null),
    loadMoneyBand(supabase),
    loadMonthlyStats(supabase),
    loadPipelines(supabase),
    loadPurchasingTrend(supabase),
    loadHousekeeping(supabase),
  ]);

  let costBasisDkk = 0;
  for (const row of costBasisRes.data ?? []) {
    const qty = Number(row.stock_on_hand);
    const cost = Number(row.last_cost_dkk);
    if (Number.isFinite(qty) && Number.isFinite(cost)) {
      costBasisDkk += qty * cost;
    }
  }

  const lowStock = lowStockRes.data ?? [];
  const overdueMOs = overdueMOsRes.data ?? [];
  const paintAging = paintAgingRes.data ?? [];

  // Money band — cards with nothing to report don't render at all; if the
  // whole band is clear it collapses to a single all-clear line.
  const { uninvoiced, overdueInvoices, expiringAgreements, latePOs, draftPOCount } =
    moneyBand;
  const hasUninvoiced = uninvoiced.total > 0 || uninvoiced.draftInvoiceCount > 0;
  const hasOverdue = overdueInvoices.rows.length > 0;
  const hasExpiring = expiringAgreements.length > 0;
  const hasPOChase = latePOs.length > 0 || draftPOCount > 0;
  const moneyAllClear =
    !hasUninvoiced && !hasOverdue && !hasExpiring && !hasPOChase;

  // Trend charts — fold state defaults are data-aware: collapsed while the
  // history is too thin to be worth screen space, open once it isn't. A
  // manual toggle (stored per device in FoldSection) always wins.
  const trendMonths: TrendMonth[] = monthlyStats.map((m) => ({
    label: trendLabel(m.monthStart),
    sold: m.bikesSold,
    serviced: m.bikesServiced,
    underAgreement: m.bikesUnderAgreement,
    sales: m.invoicedSales,
    service: m.invoicedService,
    fees: m.invoicedFees,
    purchasing: purchasing.months.get(m.monthStart.slice(0, 7)) ?? 0,
  }));
  const totalSold = monthlyStats.reduce((s, m) => s + m.bikesSold, 0);
  const totalServiced = monthlyStats.reduce((s, m) => s + m.bikesServiced, 0);
  const underAgreementNow =
    monthlyStats[monthlyStats.length - 1]?.bikesUnderAgreement ?? 0;
  const bikesActiveMonths = monthlyStats.filter(
    (m) => m.bikesSold > 0 || m.bikesServiced > 0,
  ).length;
  const bikesSummary =
    totalSold + totalServiced > 0
      ? `${totalSold} sold · ${totalServiced} serviced · ${underAgreementNow} under agreement now`
      : "No bike activity in the last 12 months yet";
  const invoicedTotal = monthlyStats.reduce(
    (s, m) => s + m.invoicedSales + m.invoicedService + m.invoicedFees,
    0,
  );
  const invoicedActiveMonths = monthlyStats.filter(
    (m) => m.invoicedSales + m.invoicedService + m.invoicedFees !== 0,
  ).length;
  const invoicedSummary =
    invoicedTotal !== 0
      ? `${formatPrice(invoicedTotal, "DKK")} invoiced (ex VAT) in the last 12 months`
      : "No invoices issued yet";
  const purchasingActiveMonths = trendMonths.filter(
    (m) => m.purchasing > 0,
  ).length;
  const purchasingSummary =
    purchasing.totalDkk > 0
      ? `${formatPrice(purchasing.totalDkk, "DKK")} landed across ${purchasing.poCount} POs in the last 12 months`
      : "No purchase orders in the last 12 months";

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Daily pulse — money on the table, counts, low stock, and anything
          that has been sitting too long.
        </p>
      </header>

      {/* Money band — only cards with something to report are rendered. */}
      {moneyAllClear ? (
        <section className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
          <CircleCheck
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500"
            aria-hidden
          />
          <p className="text-muted-foreground text-sm">
            Money side is clear — nothing uninvoiced, no overdue invoices, no
            agreements expiring within 90 days, no late purchase orders.
          </p>
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2">
          {hasUninvoiced ? (
            <AttentionCard
              title={
                uninvoiced.total > 0
                  ? `Uninvoiced work — ${formatPrice(uninvoiced.total, "DKK")}`
                  : "Invoicing to finish"
              }
              emptyMessage=""
              viewAllHref="/invoices"
              viewAllLabel="Go invoice"
              tone="warning"
            >
              {uninvoiced.woCount > 0 ? (
                <BandRow
                  href="/invoices"
                  right={formatPrice(uninvoiced.woTotal, "DKK")}
                >
                  <span className="truncate">
                    {plural(uninvoiced.woCount, "completed work order")}
                  </span>
                </BandRow>
              ) : null}
              {uninvoiced.soCount > 0 ? (
                <BandRow
                  href="/invoices"
                  right={formatPrice(uninvoiced.soTotalDkk, "DKK")}
                >
                  <span className="truncate">
                    {plural(uninvoiced.soCount, "delivered sales order")}
                    {uninvoiced.soNonDkkCount > 0
                      ? ` (${uninvoiced.soNonDkkCount} non-DKK)`
                      : ""}
                  </span>
                </BandRow>
              ) : null}
              {uninvoiced.feeMonths > 0 ? (
                <BandRow
                  href="/invoices"
                  right={formatPrice(uninvoiced.feeTotal, "DKK")}
                >
                  <span className="truncate">
                    {plural(uninvoiced.feeMonths, "agreement fee month")}
                  </span>
                </BandRow>
              ) : null}
              {uninvoiced.draftInvoiceCount > 0 ? (
                <BandRow
                  href="/invoices"
                  right={
                    uninvoiced.draftOldestDays != null &&
                    uninvoiced.draftOldestDays > 0
                      ? `oldest ${uninvoiced.draftOldestDays}d`
                      : undefined
                  }
                >
                  <span className="truncate">
                    {plural(uninvoiced.draftInvoiceCount, "draft invoice")}{" "}
                    waiting to be issued
                  </span>
                </BandRow>
              ) : null}
            </AttentionCard>
          ) : null}

          {hasOverdue ? (
            <AttentionCard
              title={`Overdue invoices — ${formatPrice(
                overdueInvoices.totalDkk,
                "DKK",
              )}`}
              emptyMessage=""
              viewAllHref="/invoices"
              tone="destructive"
            >
              {overdueInvoices.rows.slice(0, ATTENTION_LIMIT).map((inv) => (
                <BandRow
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  right={`${inv.daysOverdue}d late`}
                  rightClassName="text-destructive"
                >
                  <span className="truncate font-mono text-xs">
                    {inv.invoiceNumber}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {inv.orgName ?? "—"} ·{" "}
                    {formatPrice(inv.total, inv.currency)}
                  </span>
                </BandRow>
              ))}
            </AttentionCard>
          ) : null}

          {hasExpiring ? (
            <AttentionCard
              title="Agreements expiring"
              emptyMessage=""
              viewAllHref="/service-agreements"
              tone="warning"
            >
              {expiringAgreements.slice(0, ATTENTION_LIMIT).map((a) => (
                <BandRow
                  key={a.id}
                  href={`/service-agreements/${a.id}`}
                  right={`in ${a.daysLeft}d`}
                  rightClassName="text-amber-700 dark:text-amber-400"
                >
                  <span className="truncate">{a.orgName ?? a.name}</span>
                  {a.monthlyFee > 0 ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatPrice(a.monthlyFee, a.feeCurrency)}/mo
                    </span>
                  ) : null}
                </BandRow>
              ))}
            </AttentionCard>
          ) : null}

          {hasPOChase ? (
            <AttentionCard
              title="Purchase orders to chase"
              emptyMessage=""
              viewAllHref="/purchase-orders"
              tone="warning"
            >
              {latePOs.slice(0, ATTENTION_LIMIT).map((po) => (
                <BandRow
                  key={po.id}
                  href={`/purchase-orders/${po.id}`}
                  right={`${po.daysLate}d past expected`}
                  rightClassName="text-amber-700 dark:text-amber-400"
                >
                  <span className="truncate font-mono text-xs">
                    {po.poNumber}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {po.supplierName ?? "—"}
                  </span>
                </BandRow>
              ))}
              {draftPOCount > 0 ? (
                <BandRow href="/purchase-orders">
                  <span className="text-muted-foreground truncate text-xs">
                    {plural(draftPOCount, "draft PO")} waiting to be placed
                  </span>
                </BandRow>
              ) : null}
            </AttentionCard>
          ) : null}
        </section>
      )}

      {/* Pipelines — how work is flowing. Zeros stay visible here:
          "nothing in build" is daily signal, unlike an empty attention list. */}
      <section className="grid gap-3 lg:grid-cols-3">
        <PipelineCard
          title="Build"
          stages={[
            {
              label: "planning",
              value: pipelines.build.planning,
              href: "/bikes?status=planning",
            },
            {
              label: "building",
              value: pipelines.build.building,
              href: "/work?tab=build",
            },
            {
              label: "at painter",
              value: pipelines.build.atPainter,
              href: "/paint-orders",
            },
            {
              label: "in stock",
              value: pipelines.build.inStock,
              href: "/bikes?status=in_stock",
            },
          ]}
        />
        <PipelineCard
          title="Repair"
          stages={[
            {
              label: "open tickets",
              value: pipelines.repair.openTickets,
              href: "/maintenance/tickets",
            },
            {
              label: "work orders",
              value: pipelines.repair.openWOs,
              href: "/maintenance/work-orders",
            },
            {
              label: "done, 7 days",
              value: pipelines.repair.doneLast7,
              href: "/maintenance/work-orders",
            },
          ]}
        />
        <PipelineCard
          title="Orders in flight"
          stages={[
            {
              label: "sales orders",
              value: pipelines.orders.openSOs,
              href: "/sales-orders",
              hint:
                pipelines.orders.soValueDkk > 0
                  ? formatPrice(pipelines.orders.soValueDkk, "DKK")
                  : null,
            },
            {
              label: "manufacturing",
              value: pipelines.orders.openMOs,
              href: "/manufacturing-orders",
            },
            {
              label: "purchase orders",
              value: pipelines.orders.openPOs,
              href: "/purchase-orders",
            },
          ]}
        />
      </section>

      {/* Attention strip */}
      <section className="grid gap-3 lg:grid-cols-3">
        <AttentionCard
          title="Low stock"
          emptyMessage="All parts above reorder point. Nothing to chase."
          viewAllHref="/parts?stock=low"
          tone="warning"
        >
          {lowStock.map((p) => {
            const onHand = Number(p.stock_on_hand);
            const reorder =
              p.reorder_point == null ? null : Number(p.reorder_point);
            return (
              <li key={p.id} className="text-sm">
                <Link
                  href={`/parts/${p.id}`}
                  className="hover:bg-muted/50 flex items-center justify-between gap-2 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge
                      variant={p.stock_status === "out" ? "destructive" : "warning"}
                      className="shrink-0"
                    >
                      {p.stock_status === "out" ? "Out" : "Low"}
                    </Badge>
                    <span className="text-muted-foreground truncate font-mono text-xs">
                      {p.internal_sku}
                    </span>
                    <span className="truncate">{p.name_en}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {Math.trunc(onHand)}
                    {reorder == null ? "" : ` / ${Math.trunc(reorder)}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </AttentionCard>

        <AttentionCard
          title="Overdue MOs"
          emptyMessage="Every open MO is on schedule."
          viewAllHref="/manufacturing-orders"
          tone="destructive"
        >
          {overdueMOs.map((mo) => {
            const overdueDays = mo.planned_completion_date
              ? diffDays(mo.planned_completion_date)
              : 0;
            return (
              <li key={mo.id} className="text-sm">
                <Link
                  href={`/manufacturing-orders/${mo.id}`}
                  className="hover:bg-muted/50 flex items-center justify-between gap-2 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle
                      className="text-destructive size-3.5 shrink-0"
                      aria-hidden
                    />
                    <span className="truncate font-mono text-xs">
                      {mo.mo_number}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      due {formatDate(mo.planned_completion_date)}
                    </span>
                  </div>
                  <span className="text-destructive shrink-0 text-xs tabular-nums">
                    {overdueDays}d late
                  </span>
                </Link>
              </li>
            );
          })}
        </AttentionCard>

        <AttentionCard
          title={`Paint orders > ${PAINT_AGING_DAYS} days at painter`}
          emptyMessage="No paint orders waiting longer than expected."
          viewAllHref="/paint-orders"
          tone="warning"
        >
          {paintAging.map((po) => {
            const days = po.sent_at ? diffDays(po.sent_at) : 0;
            return (
              <li key={po.id} className="text-sm">
                <Link
                  href={`/paint-orders/${po.id}`}
                  className="hover:bg-muted/50 flex items-center justify-between gap-2 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarClock
                      className="text-muted-foreground size-3.5 shrink-0"
                      aria-hidden
                    />
                    <span className="truncate font-mono text-xs">
                      {po.paint_order_number}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {po.supplier?.name ?? "—"}
                    </span>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {days}d
                  </span>
                </Link>
              </li>
            );
          })}
        </AttentionCard>
      </section>

      {/* Trends — foldable so a thin history doesn't cost screen space.
          Defaults are data-aware; the header summary keeps the signal
          visible while folded, and a manual toggle is remembered per
          device. */}
      <section className="flex flex-col gap-3">
        <FoldSection
          storageId="bikes-trend"
          title="Bikes — last 12 months"
          summary={bikesSummary}
          defaultOpen={bikesActiveMonths >= 3}
        >
          <BikesTrendChart months={trendMonths} />
        </FoldSection>
        <FoldSection
          storageId="invoiced-trend"
          title="Invoiced — last 12 months"
          summary={invoicedSummary}
          defaultOpen={invoicedActiveMonths >= 2}
        >
          <InvoicedTrendChart months={trendMonths} />
        </FoldSection>
        <FoldSection
          storageId="purchasing-trend"
          title="Purchasing — last 12 months"
          summary={purchasingSummary}
          defaultOpen={purchasingActiveMonths >= 2}
        >
          <PurchasingTrendChart months={trendMonths} />
        </FoldSection>
        <FoldSection
          storageId="housekeeping"
          title="Data housekeeping"
          summary={
            housekeeping.total > 0
              ? `${housekeeping.total} gaps — origins, HS codes, prices, supplier emails`
              : "No data gaps"
          }
          defaultOpen={false}
        >
          <ul className="flex flex-col gap-1.5">
            {housekeeping.partsNoOrigin > 0 ? (
              <BandRow href="/parts">
                <span className="truncate">
                  {`${plural(housekeeping.partsNoOrigin, "part")} without origin — new PO lines default to no import tax`}
                </span>
              </BandRow>
            ) : null}
            {housekeeping.partsNoHs > 0 ? (
              <BandRow href="/parts">
                <span className="truncate">
                  {`${plural(housekeeping.partsNoHs, "part")} without an HS code`}
                </span>
              </BandRow>
            ) : null}
            {housekeeping.offeringsNoPrice > 0 ? (
              <BandRow href="/parts">
                <span className="truncate">
                  {`${plural(housekeeping.offeringsNoPrice, "supplier offering")} without a purchase price — drafted POs come out at 0 kr.`}
                </span>
              </BandRow>
            ) : null}
            {housekeeping.suppliersNoEmail > 0 ? (
              <BandRow href="/suppliers">
                <span className="truncate">
                  {`${plural(housekeeping.suppliersNoEmail, "supplier")} without an email — blocks "Email supplier"`}
                </span>
              </BandRow>
            ) : null}
          </ul>
        </FoldSection>
      </section>

      {/* Reference line — slow-moving numbers that used to be KPI cards. */}
      <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="text-muted-foreground size-4" aria-hidden />
          <span className="text-muted-foreground">Catalog cost basis</span>
          <span className="text-base font-semibold tabular-nums">
            {formatPrice(costBasisDkk, "DKK")}
          </span>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <Link
            href="/parts"
            className="hover:text-foreground transition-colors"
          >
            <span className="text-foreground font-semibold tabular-nums">
              {partsCount.count ?? 0}
            </span>{" "}
            parts in catalog
          </Link>
          <Link
            href="/organizations"
            className="hover:text-foreground transition-colors"
          >
            <span className="text-foreground font-semibold tabular-nums">
              {customersCount.count ?? 0}
            </span>{" "}
            customers
          </Link>
        </div>
      </section>
    </div>
  );
}
