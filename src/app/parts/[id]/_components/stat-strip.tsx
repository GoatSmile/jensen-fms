import { Badge } from "@/components/ui/badge";
import {
  STOCK_BADGE_LABEL,
  STOCK_BADGE_VARIANT,
  formatDkk,
  formatQuantity,
  type StockStatus,
} from "@/lib/parts/stock";
import { formatDate } from "@/lib/parts/format";

type Props = {
  stockOnHand: number;
  stockStatus: StockStatus;
  lastCostDkk: number | null;
  lastCostDate: string | null;
  supplierCount: number;
};

export function StatStrip({
  stockOnHand,
  stockStatus,
  lastCostDkk,
  lastCostDate,
  supplierCount,
}: Props) {
  const stockValue =
    lastCostDkk != null ? lastCostDkk * stockOnHand : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Stock on hand">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {formatQuantity(stockOnHand)}
          </span>
          <Badge variant={STOCK_BADGE_VARIANT[stockStatus]}>
            {STOCK_BADGE_LABEL[stockStatus]}
          </Badge>
        </div>
      </Stat>
      <Stat label="Last landed cost">
        <span className="text-2xl font-semibold tabular-nums">
          {formatDkk(lastCostDkk)}
        </span>
        {lastCostDate ? (
          <span className="text-muted-foreground text-xs">
            as of {formatDate(lastCostDate)}
          </span>
        ) : null}
      </Stat>
      <Stat label="Stock value">
        <span className="text-2xl font-semibold tabular-nums">
          {formatDkk(stockValue)}
        </span>
        {stockValue != null ? (
          <span className="text-muted-foreground text-xs">
            on-hand × last cost
          </span>
        ) : null}
      </Stat>
      <Stat label="Suppliers">
        <span className="text-2xl font-semibold tabular-nums">
          {supplierCount}
        </span>
        <span className="text-muted-foreground text-xs">
          {supplierCount === 1 ? "offering on file" : "offerings on file"}
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
