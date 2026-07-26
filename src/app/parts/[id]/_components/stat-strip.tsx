import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { HUE_FILL, type PanelHue } from "@/components/ui/panel";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import {
  STOCK_BADGE_VARIANT,
  formatDkk,
  formatQuantity,
  type StockStatus,
} from "@/lib/parts/stock";

type Props = {
  stockOnHand: number;
  stockStatus: StockStatus;
  /** Still feeds the stock-value card (on-hand × last cost). */
  lastCostDkk: number | null;
  retailPrice: number | null;
  retailCurrency: string | null;
  supplierCount: number;
};

export async function StatStrip({
  stockOnHand,
  stockStatus,
  lastCostDkk,
  retailPrice,
  retailCurrency,
  supplierCount,
}: Props) {
  const [t, tStock] = await Promise.all([
    getTranslations("partDetail"),
    getTranslations("stockStatus"),
  ]);
  const stockValue =
    lastCostDkk != null ? lastCostDkk * stockOnHand : null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* Stock is `brand`, not `good`: the badge beside it can say "Out", and
          a green block behind an out-of-stock figure would contradict it. */}
      <Stat label={t("statStock")} hue="brand">
        <div className="flex items-baseline gap-2">
          <span className="text-[1.8rem] font-bold leading-none tracking-[-0.03em] tabular-nums">
            {formatQuantity(stockOnHand)}
          </span>
          <Badge variant={STOCK_BADGE_VARIANT[stockStatus]}>
            {tStock(stockStatus)}
          </Badge>
        </div>
      </Stat>
      <Stat label={t("statRetail")} hue="money">
        <Money
          amount={retailPrice}
          currency={retailCurrency ?? "DKK"}
          className="text-[1.8rem] font-bold leading-none tracking-[-0.03em]"
        />
        {retailPrice != null ? (
          <span className="text-ink-3 text-xs">{t("customerPriceNote")}</span>
        ) : null}
      </Stat>
      <Stat label={t("statStockValue")} hue="money">
        <span className="text-[1.8rem] font-bold leading-none tracking-[-0.03em] tabular-nums">
          {formatDkk(stockValue)}
        </span>
        {stockValue != null ? (
          <span className="text-ink-3 text-xs">{t("stockValueNote")}</span>
        ) : null}
      </Stat>
      <Stat label={t("statSuppliers")} hue="buy">
        <span className="text-[1.8rem] font-bold leading-none tracking-[-0.03em] tabular-nums">
          {supplierCount}
        </span>
        <span className="text-ink-3 text-xs">
          {t("offeringsOnFile", { count: supplierCount })}
        </span>
      </Stat>
    </div>
  );
}

/**
 * Local sibling of `Metric` — same flat-fill treatment, but this row's figures
 * carry extra children (a stock badge, the `Money` component's greyed
 * decimals) that a plain value prop can't express.
 */
function Stat({
  label,
  hue,
  children,
}: {
  label: string;
  hue: PanelHue;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg px-5 py-4", HUE_FILL[hue])}>
      <span className="text-ink-2 text-[10.5px] font-bold uppercase tracking-[0.08em]">
        {label}
      </span>
      {children}
    </div>
  );
}
