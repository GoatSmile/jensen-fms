import type { ReactNode } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
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
  loadInboundStats,
  loadMoneyBand,
  loadMonthlyStats,
  loadPipelines,
  loadPurchasingTrend,
} from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";
import { OPEN_MO_STATUSES } from "@/lib/mo/status";
import { AT_SUPPLIER_STATUSES } from "@/lib/services/status";
import { readAllowedCaps } from "@/lib/auth/read-session";
import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/parts/format";
import { createClient } from "@/lib/supabase/server";

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
function trendLabel(monthStart: string, locale: string): string {
  const d = new Date(`${monthStart}T00:00:00Z`);
  const m = d.toLocaleString(locale, { month: "short", timeZone: "UTC" });
  return d.getUTCMonth() === 0
    ? `${m} ${String(d.getUTCFullYear()).slice(2)}`
    : m;
}

/** Percentage as a rounded whole-number string, e.g. "50%"; em-dash when n/a. */
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

/** Compact stat tile for the inbox-pipeline calibration fold. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background rounded-md border p-3">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
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
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const allowedCaps = await readAllowedCaps();
  const showMoneyBand =
    allowedCaps === null || allowedCaps.includes("invoices");
  const showInbox = allowedCaps === null || allowedCaps.includes("inbox");
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
    inboundStats,
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
      .from("service_orders")
      .select(
        "id, order_number, sent_at, status, supplier:suppliers(id, name)",
      )
      .in("status", AT_SUPPLIER_STATUSES)
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
    loadInboundStats(supabase),
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
    label: trendLabel(m.monthStart, locale),
    month: m.monthStart,
    monthTitle: new Date(`${m.monthStart}T00:00:00Z`).toLocaleString(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
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
      ? t("bikesSummary", {
          sold: totalSold,
          serviced: totalServiced,
          under: underAgreementNow,
        })
      : t("bikesSummaryEmpty");
  const invoicedTotal = monthlyStats.reduce(
    (s, m) => s + m.invoicedSales + m.invoicedService + m.invoicedFees,
    0,
  );
  const invoicedActiveMonths = monthlyStats.filter(
    (m) => m.invoicedSales + m.invoicedService + m.invoicedFees !== 0,
  ).length;
  const invoicedSummary =
    invoicedTotal !== 0
      ? t("invoicedSummary", { amount: formatPrice(invoicedTotal, "DKK") })
      : t("invoicedSummaryEmpty");
  const purchasingActiveMonths = trendMonths.filter(
    (m) => m.purchasing > 0,
  ).length;
  const purchasingSummary =
    purchasing.totalDkk > 0
      ? t("purchasingSummary", {
          amount: formatPrice(purchasing.totalDkk, "DKK"),
          count: purchasing.poCount,
        })
      : t("purchasingSummaryEmpty");

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      {/* Money band — only cards with something to report are rendered.
          Hidden entirely for roles without the invoices capability
          (people & roles P2): money signals belong to money roles. */}
      {!showMoneyBand ? null : moneyAllClear ? (
        <section className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
          <CircleCheck
            className="size-4 shrink-0 text-good"
            aria-hidden
          />
          <p className="text-muted-foreground text-sm">
            {t("moneyAllClear")}
          </p>
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2">
          {hasUninvoiced ? (
            <AttentionCard
              title={
                uninvoiced.total > 0
                  ? t("uninvoicedLabel")
                  : t("invoicingToFinish")
              }
              figure={
                uninvoiced.total > 0
                  ? formatPrice(uninvoiced.total, "DKK")
                  : undefined
              }
              emptyMessage=""
              viewAllHref="/invoices"
              viewAllLabel={t("goInvoice")}
              hue="money"
            >
              {uninvoiced.woCount > 0 ? (
                <BandRow
                  href="/invoices"
                  right={formatPrice(uninvoiced.woTotal, "DKK")}
                >
                  <span className="truncate">
                    {t("completedWo", { count: uninvoiced.woCount })}
                  </span>
                </BandRow>
              ) : null}
              {uninvoiced.soCount > 0 ? (
                <BandRow
                  href="/invoices"
                  right={formatPrice(uninvoiced.soTotalDkk, "DKK")}
                >
                  <span className="truncate">
                    {t("deliveredSo", { count: uninvoiced.soCount })}
                    {uninvoiced.soNonDkkCount > 0
                      ? t("soNonDkk", { count: uninvoiced.soNonDkkCount })
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
                    {t("feeMonths", { count: uninvoiced.feeMonths })}
                  </span>
                </BandRow>
              ) : null}
              {uninvoiced.draftInvoiceCount > 0 ? (
                <BandRow
                  href="/invoices"
                  right={
                    uninvoiced.draftOldestDays != null &&
                    uninvoiced.draftOldestDays > 0
                      ? t("oldestDays", { days: uninvoiced.draftOldestDays })
                      : undefined
                  }
                >
                  <span className="truncate">
                    {t("draftInvoices", {
                      count: uninvoiced.draftInvoiceCount,
                    })}
                  </span>
                </BandRow>
              ) : null}
            </AttentionCard>
          ) : null}

          {hasOverdue ? (
            <AttentionCard
              title={t("overdueLabel")}
              figure={formatPrice(overdueInvoices.totalDkk, "DKK")}
              emptyMessage=""
              viewAllHref="/invoices"
              hue="money"
            >
              {overdueInvoices.rows.slice(0, ATTENTION_LIMIT).map((inv) => (
                <BandRow
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  right={t("daysLate", { days: inv.daysOverdue })}
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
              title={t("agreementsExpiring")}
              emptyMessage=""
              viewAllHref="/service-agreements"
              hue="system"
            >
              {expiringAgreements.slice(0, ATTENTION_LIMIT).map((a) => (
                <BandRow
                  key={a.id}
                  href={`/service-agreements/${a.id}`}
                  right={t("inDays", { days: a.daysLeft })}
                  rightClassName="text-system"
                >
                  <span className="truncate">
                    {a.orgName ?? a.name ?? t("agreementFallbackName")}
                  </span>
                  {a.monthlyFee > 0 ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t("perMonth", {
                        amount: formatPrice(a.monthlyFee, a.feeCurrency),
                      })}
                    </span>
                  ) : null}
                </BandRow>
              ))}
            </AttentionCard>
          ) : null}

          {hasPOChase ? (
            <AttentionCard
              title={t("poChase")}
              emptyMessage=""
              viewAllHref="/purchase-orders"
              hue="buy"
            >
              {latePOs.slice(0, ATTENTION_LIMIT).map((po) => (
                <BandRow
                  key={po.id}
                  href={`/purchase-orders/${po.id}`}
                  right={t("daysPastExpected", { days: po.daysLate })}
                  rightClassName="text-buy"
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
                    {t("draftPos", { count: draftPOCount })}
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
          hue="brand"
          title={t("pipeline.build")}
          stages={[
            {
              label: t("pipeline.planning"),
              value: pipelines.build.planning,
              href: "/bikes?status=planning",
            },
            {
              label: t("pipeline.building"),
              value: pipelines.build.building,
              href: "/work?tab=build",
            },
            {
              label: t("pipeline.atPainter"),
              value: pipelines.build.atPainter,
              href: "/paint-orders",
            },
            {
              label: t("pipeline.inStock"),
              value: pipelines.build.inStock,
              href: "/bikes?status=in_stock",
            },
          ]}
        />
        <PipelineCard
          hue="good"
          title={t("pipeline.repair")}
          stages={[
            {
              label: t("pipeline.openTickets"),
              value: pipelines.repair.openTickets,
              href: "/maintenance/tickets",
            },
            {
              label: t("pipeline.workOrders"),
              value: pipelines.repair.openWOs,
              href: "/maintenance/work-orders",
            },
            {
              label: t("pipeline.done7"),
              value: pipelines.repair.doneLast7,
              href: "/maintenance/work-orders",
            },
          ]}
        />
        <PipelineCard
          hue="money"
          title={t("pipeline.ordersInFlight")}
          stages={[
            {
              label: t("pipeline.salesOrders"),
              value: pipelines.orders.openSOs,
              href: "/sales-orders",
              hint:
                pipelines.orders.soValueDkk > 0
                  ? formatPrice(pipelines.orders.soValueDkk, "DKK")
                  : null,
            },
            {
              label: t("pipeline.manufacturing"),
              value: pipelines.orders.openMOs,
              href: "/manufacturing-orders",
            },
            {
              label: t("pipeline.purchaseOrders"),
              value: pipelines.orders.openPOs,
              href: "/purchase-orders",
            },
          ]}
        />
      </section>

      {/* Attention strip */}
      <section className="grid gap-3 lg:grid-cols-3">
        <AttentionCard
          title={t("lowStock")}
          emptyMessage={t("lowStockEmpty")}
          viewAllHref="/parts?stock=low"
          hue="alert"
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
                      {p.stock_status === "out" ? t("stockOut") : t("stockLow")}
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
          title={t("overdueMos")}
          emptyMessage={t("overdueMosEmpty")}
          viewAllHref="/manufacturing-orders"
          hue="alert"
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
                      {t("due", {
                        date: formatDate(mo.planned_completion_date),
                      })}
                    </span>
                  </div>
                  <span className="text-destructive shrink-0 text-xs tabular-nums">
                    {t("daysLate", { days: overdueDays })}
                  </span>
                </Link>
              </li>
            );
          })}
        </AttentionCard>

        <AttentionCard
          title={t("paintAging", { days: PAINT_AGING_DAYS })}
          emptyMessage={t("paintAgingEmpty")}
          viewAllHref="/paint-orders"
          hue="alert"
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
                      {po.order_number}
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
          title={t("bikesTrendTitle")}
          summary={bikesSummary}
          defaultOpen={bikesActiveMonths >= 3}
        >
          <BikesTrendChart months={trendMonths} />
        </FoldSection>
        <FoldSection
          storageId="invoiced-trend"
          title={t("invoicedTrendTitle")}
          summary={invoicedSummary}
          defaultOpen={invoicedActiveMonths >= 2}
        >
          <InvoicedTrendChart months={trendMonths} />
        </FoldSection>
        <FoldSection
          storageId="purchasing-trend"
          title={t("purchasingTrendTitle")}
          summary={purchasingSummary}
          defaultOpen={purchasingActiveMonths >= 2}
        >
          <PurchasingTrendChart months={trendMonths} />
        </FoldSection>
        <FoldSection
          storageId="housekeeping"
          title={t("housekeepingTitle")}
          summary={
            housekeeping.total > 0
              ? t("housekeepingSummary", { count: housekeeping.total })
              : t("housekeepingClear")
          }
          defaultOpen={false}
        >
          <ul className="flex flex-col gap-1.5">
            {housekeeping.partsNoOrigin > 0 ? (
              <BandRow href="/parts?gap=origin">
                <span className="truncate">
                  {t("gapOrigin", { count: housekeeping.partsNoOrigin })}
                </span>
              </BandRow>
            ) : null}
            {housekeeping.partsNoHs > 0 ? (
              <BandRow href="/parts?gap=hs">
                <span className="truncate">
                  {t("gapHs", { count: housekeeping.partsNoHs })}
                </span>
              </BandRow>
            ) : null}
            {housekeeping.offeringsNoPrice > 0 ? (
              <BandRow href="/parts?gap=offer-price">
                <span className="truncate">
                  {t("gapOfferPrice", { count: housekeeping.offeringsNoPrice })}
                </span>
              </BandRow>
            ) : null}
            {housekeeping.suppliersNoEmail > 0 ? (
              <BandRow href="/admin/suppliers?gap=email">
                <span className="truncate">
                  {t("gapEmail", { count: housekeeping.suppliersNoEmail })}
                </span>
              </BandRow>
            ) : null}
          </ul>
        </FoldSection>

        {/* Inbox pipeline — shadow-mode calibration stats (phone→ticket).
            Thin by design: it's the measurement that turns August's "leave
            shadow mode?" into a data decision. Gated to the inbox capability. */}
        {showInbox ? (
          <FoldSection
            storageId="inbox-stats"
            title={t("inboxStatsTitle")}
            summary={
              inboundStats.total > 0
                ? t("inboxStatsSummary", {
                    count: inboundStats.total,
                    pct: pct(inboundStats.matched, inboundStats.total),
                  })
                : t("inboxStatsEmpty")
            }
            defaultOpen={false}
          >
            {inboundStats.total === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("inboxStatsEmptyBody")}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <StatTile
                    label={t("inboxStatMessages")}
                    value={String(inboundStats.total)}
                  />
                  <StatTile
                    label={t("inboxStatMatchRate")}
                    value={pct(inboundStats.matched, inboundStats.total)}
                  />
                  <StatTile
                    label={t("inboxStatTickets")}
                    value={String(inboundStats.ticketed)}
                  />
                  <StatTile
                    label={t("inboxStatClarity")}
                    value={
                      inboundStats.withClarity > 0
                        ? pct(inboundStats.garbled, inboundStats.withClarity)
                        : "—"
                    }
                  />
                  <StatTile
                    label={t("inboxStatSpam")}
                    value={pct(inboundStats.spam, inboundStats.total)}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("inboxStatIntentMix", {
                    repair: inboundStats.intents.repair,
                    order: inboundStats.intents.order,
                    other: inboundStats.intents.other,
                  })}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("inboxStatsShadowHint")}
                </p>
              </div>
            )}
          </FoldSection>
        ) : null}
      </section>

      {/* Reference line — slow-moving numbers that used to be KPI cards. */}
      <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="text-muted-foreground size-4" aria-hidden />
          <span className="text-muted-foreground">{t("costBasis")}</span>
          <span className="text-base font-semibold tabular-nums">
            {formatPrice(costBasisDkk, "DKK")}
          </span>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <Link
            href="/parts"
            className="hover:text-foreground transition-colors"
          >
            {t.rich("partsInCatalog", {
              count: partsCount.count ?? 0,
              b: (chunks) => (
                <span className="text-foreground font-semibold tabular-nums">
                  {chunks}
                </span>
              ),
            })}
          </Link>
          <Link
            href="/organizations"
            className="hover:text-foreground transition-colors"
          >
            {t.rich("customersRef", {
              count: customersCount.count ?? 0,
              b: (chunks) => (
                <span className="text-foreground font-semibold tabular-nums">
                  {chunks}
                </span>
              ),
            })}
          </Link>
        </div>
      </section>
    </div>
  );
}
