import Link from "next/link";
import {
  AlertTriangle,
  Bike,
  Boxes,
  CalendarClock,
  Hammer,
  Paintbrush,
  TrendingUp,
} from "lucide-react";

import {
  AttentionCard,
  StatCard,
} from "@/components/dashboard-card";
import { Badge } from "@/components/ui/badge";
import { OPEN_MO_STATUSES } from "@/lib/mo/status";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const OPEN_PAINT_STATUSES = ["planned", "sent_to_painter", "at_painter"] as const;
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

function formatDateDa(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = todayISODate();
  const paintCutoff = daysAgo(PAINT_AGING_DAYS);

  const [
    partsCount,
    bikesCount,
    openMOsCount,
    openPaintCount,
    lowStockRes,
    overdueMOsRes,
    paintAgingRes,
    costBasisRes,
  ] = await Promise.all([
    supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("bikes")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("status", "in", "(retired,lost_or_stolen)"),
    supabase
      .from("manufacturing_orders")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_MO_STATUSES),
    supabase
      .from("paint_orders")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_PAINT_STATUSES),
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

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Daily pulse — counts, low stock, and anything that has been
          sitting too long.
        </p>
      </header>

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Parts in catalog"
          value={partsCount.count ?? 0}
          icon={Boxes}
          href="/parts"
        />
        <StatCard
          label="Active bikes"
          value={bikesCount.count ?? 0}
          icon={Bike}
          href="/bikes"
        />
        <StatCard
          label="Open manufacturing orders"
          value={openMOsCount.count ?? 0}
          icon={Hammer}
          href="/manufacturing-orders"
        />
        <StatCard
          label="Open paint orders"
          value={openPaintCount.count ?? 0}
          icon={Paintbrush}
          href="/paint-orders"
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
                      due {formatDateDa(mo.planned_completion_date)}
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

      {/* Catalog cost basis — one-line headline stat */}
      <section className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="text-muted-foreground size-4" aria-hidden />
          <span className="text-muted-foreground">Catalog cost basis</span>
        </div>
        <span className="text-base font-semibold tabular-nums">
          {formatPrice(costBasisDkk, "DKK")}
        </span>
      </section>
    </div>
  );
}
