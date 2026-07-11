"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPrice } from "@/lib/format";

import {
  MonthDetailSheet,
  type MonthSelection,
} from "./month-detail-sheet";

/** One chart-ready month; labels are pre-formatted server-side. */
export type TrendMonth = {
  label: string;
  /** Month start (YYYY-MM-01) — the drill-down key. */
  month: string;
  /** Full label for the drill-down sheet title, e.g. "March 2026". */
  monthTitle: string;
  sold: number;
  serviced: number;
  underAgreement: number;
  sales: number;
  service: number;
  fees: number;
  purchasing: number;
};

/** Recharts click payloads wrap the datum; unwrap defensively. */
function datumOf(e: unknown): TrendMonth | null {
  if (!e || typeof e !== "object") return null;
  const wrapped = (e as { payload?: TrendMonth }).payload;
  return wrapped ?? (e as TrendMonth);
}

const COLORS = {
  sold: "#2a78d6",
  serviced: "#1baf7a",
  underAgreement: "#eda100",
  sales: "#2a78d6",
  service: "#1baf7a",
  fees: "#eda100",
  purchasing: "#2a78d6",
} as const;

function Legend({ items }: { items: { color: string; label: string; line?: boolean }[] }) {
  return (
    <div className="text-muted-foreground mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-[2px]"
            style={{
              background: it.color,
              width: it.line ? 14 : 10,
              height: it.line ? 3 : 10,
            }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

type TooltipRow = { name?: string; value?: number | string; color?: string };

function ChartTooltip({
  active,
  label,
  payload,
  money,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipRow[];
  money?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((row) => (
        <p key={row.name} className="flex items-center gap-1.5 tabular-nums">
          <span
            className="inline-block size-2 rounded-[2px]"
            style={{ background: row.color }}
            aria-hidden
          />
          {row.name}:{" "}
          {money ? formatPrice(Number(row.value ?? 0), "DKK") : row.value}
        </p>
      ))}
    </div>
  );
}

const AXIS_TICK = { fontSize: 11, fill: "currentColor" } as const;

/** Bars for bikes sold + serviced per month, line for the fleet under agreement. */
export function BikesTrendChart({ months }: { months: TrendMonth[] }) {
  const t = useTranslations("dashboard.charts");
  const [sel, setSel] = useState<MonthSelection | null>(null);
  const open = (kind: "sold" | "serviced") => (e: unknown) => {
    const m = datumOf(e);
    if (!m) return;
    setSel({
      kind,
      monthStart: m.month,
      title: t(kind === "sold" ? "soldSheet" : "servicedSheet", {
        month: m.monthTitle,
      }),
    });
  };
  return (
    <div className="text-muted-foreground">
      <Legend
        items={[
          { color: COLORS.sold, label: t("sold") },
          { color: COLORS.serviced, label: t("serviced") },
          {
            color: COLORS.underAgreement,
            label: t("underAgreement"),
            line: true,
          },
        ]}
      />
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
            <Bar dataKey="sold" name={t("sold")} fill={COLORS.sold} maxBarSize={14} radius={[3, 3, 0, 0]} cursor="pointer" onClick={open("sold")} />
            <Bar dataKey="serviced" name={t("serviced")} fill={COLORS.serviced} maxBarSize={14} radius={[3, 3, 0, 0]} cursor="pointer" onClick={open("serviced")} />
            <Line
              dataKey="underAgreement"
              name={t("underAgreement")}
              type="monotone"
              stroke={COLORS.underAgreement}
              strokeWidth={2}
              dot={{ r: 2.5, fill: COLORS.underAgreement, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <MonthDetailSheet selection={sel} onClose={() => setSel(null)} />
    </div>
  );
}

/** Single-series bars: landed DKK committed per month (by PO order date). */
export function PurchasingTrendChart({ months }: { months: TrendMonth[] }) {
  const t = useTranslations("dashboard.charts");
  const [sel, setSel] = useState<MonthSelection | null>(null);
  const open = (e: unknown) => {
    const m = datumOf(e);
    if (!m) return;
    setSel({
      kind: "purchasing",
      monthStart: m.month,
      title: t("purchasingSheet", { month: m.monthTitle }),
    });
  };
  return (
    <div className="text-muted-foreground">
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={(v: number) =>
                Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
              }
            />
            <Tooltip content={<ChartTooltip money />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
            <Bar
              dataKey="purchasing"
              name={t("landedCostOrdered")}
              fill={COLORS.purchasing}
              maxBarSize={18}
              radius={[3, 3, 0, 0]}
              cursor="pointer"
              onClick={open}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <MonthDetailSheet selection={sel} onClose={() => setSel(null)} />
    </div>
  );
}

/** Stacked bars of invoiced DKK per month, split by source. */
export function InvoicedTrendChart({ months }: { months: TrendMonth[] }) {
  const t = useTranslations("dashboard.charts");
  const [sel, setSel] = useState<MonthSelection | null>(null);
  // All three stack segments open the same month view — the interesting
  // unit is the month's invoices; the split is shown in the description.
  const open = (e: unknown) => {
    const m = datumOf(e);
    if (!m) return;
    setSel({
      kind: "invoiced",
      monthStart: m.month,
      title: t("invoicedSheet", { month: m.monthTitle }),
      description: t("invoicedSplit", {
        sales: formatPrice(m.sales, "DKK"),
        service: formatPrice(m.service, "DKK"),
        fees: formatPrice(m.fees, "DKK"),
      }),
    });
  };
  return (
    <div className="text-muted-foreground">
      <Legend
        items={[
          { color: COLORS.sales, label: t("bikeSales") },
          { color: COLORS.service, label: t("service") },
          { color: COLORS.fees, label: t("agreementFees") },
        ]}
      />
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={(v: number) =>
                Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
              }
            />
            <Tooltip content={<ChartTooltip money />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
            <Bar dataKey="sales" name={t("bikeSales")} stackId="inv" fill={COLORS.sales} maxBarSize={18} cursor="pointer" onClick={open} />
            <Bar dataKey="service" name={t("service")} stackId="inv" fill={COLORS.service} maxBarSize={18} cursor="pointer" onClick={open} />
            <Bar dataKey="fees" name={t("agreementFees")} stackId="inv" fill={COLORS.fees} maxBarSize={18} radius={[3, 3, 0, 0]} cursor="pointer" onClick={open} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <MonthDetailSheet selection={sel} onClose={() => setSel(null)} />
    </div>
  );
}
