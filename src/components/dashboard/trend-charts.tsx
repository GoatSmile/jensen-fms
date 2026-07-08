"use client";

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

/** One chart-ready month; labels are pre-formatted server-side. */
export type TrendMonth = {
  label: string;
  sold: number;
  serviced: number;
  underAgreement: number;
  sales: number;
  service: number;
  fees: number;
};

const COLORS = {
  sold: "#2a78d6",
  serviced: "#1baf7a",
  underAgreement: "#eda100",
  sales: "#2a78d6",
  service: "#1baf7a",
  fees: "#eda100",
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
  return (
    <div className="text-muted-foreground">
      <Legend
        items={[
          { color: COLORS.sold, label: "Sold" },
          { color: COLORS.serviced, label: "Serviced" },
          { color: COLORS.underAgreement, label: "Under agreement", line: true },
        ]}
      />
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
            <Bar dataKey="sold" name="Sold" fill={COLORS.sold} maxBarSize={14} radius={[3, 3, 0, 0]} />
            <Bar dataKey="serviced" name="Serviced" fill={COLORS.serviced} maxBarSize={14} radius={[3, 3, 0, 0]} />
            <Line
              dataKey="underAgreement"
              name="Under agreement"
              type="monotone"
              stroke={COLORS.underAgreement}
              strokeWidth={2}
              dot={{ r: 2.5, fill: COLORS.underAgreement, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Stacked bars of invoiced DKK per month, split by source. */
export function InvoicedTrendChart({ months }: { months: TrendMonth[] }) {
  return (
    <div className="text-muted-foreground">
      <Legend
        items={[
          { color: COLORS.sales, label: "Bike sales" },
          { color: COLORS.service, label: "Service" },
          { color: COLORS.fees, label: "Agreement fees" },
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
            <Bar dataKey="sales" name="Bike sales" stackId="inv" fill={COLORS.sales} maxBarSize={18} />
            <Bar dataKey="service" name="Service" stackId="inv" fill={COLORS.service} maxBarSize={18} />
            <Bar dataKey="fees" name="Agreement fees" stackId="inv" fill={COLORS.fees} maxBarSize={18} radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
