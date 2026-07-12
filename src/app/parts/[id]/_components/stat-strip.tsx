import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
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
      <Stat label={t("statStock")}>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {formatQuantity(stockOnHand)}
          </span>
          <Badge variant={STOCK_BADGE_VARIANT[stockStatus]}>
            {tStock(stockStatus)}
          </Badge>
        </div>
      </Stat>
      <Stat label={t("statRetail")}>
        <Money
          amount={retailPrice}
          currency={retailCurrency ?? "DKK"}
          className="text-2xl font-semibold"
        />
        {retailPrice != null ? (
          <span className="text-muted-foreground text-xs">
            {t("customerPriceNote")}
          </span>
        ) : null}
      </Stat>
      <Stat label={t("statStockValue")}>
        <span className="text-2xl font-semibold tabular-nums">
          {formatDkk(stockValue)}
        </span>
        {stockValue != null ? (
          <span className="text-muted-foreground text-xs">
            {t("stockValueNote")}
          </span>
        ) : null}
      </Stat>
      <Stat label={t("statSuppliers")}>
        <span className="text-2xl font-semibold tabular-nums">
          {supplierCount}
        </span>
        <span className="text-muted-foreground text-xs">
          {t("offeringsOnFile", { count: supplierCount })}
        </span>
      </Stat>
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}
