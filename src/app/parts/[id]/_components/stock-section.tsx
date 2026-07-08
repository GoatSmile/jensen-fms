import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatQuantity } from "@/lib/parts/stock";
import { formatDateTime } from "@/lib/parts/format";

import {
  AdjustStockDialog,
  type CurrencyOption,
  type LocationOption,
} from "./adjust-stock-dialog";
import { EmptyRow, Section } from "./section";

export type StockRow = {
  locationId: string;
  locationCode: string;
  locationName: string;
  quantityOnHand: number;
  lastMovementAt: string | null;
};

type Props = {
  rows: StockRow[];
  partId: string;
  partName: string;
  locations: LocationOption[];
  /** Set of active location ids — rows at retired locations show no Adjust button. */
  activeLocationIds: Set<string>;
  /** When true, collapse the per-location breakdown to a single on-hand total. */
  hideLocations?: boolean;
  /** Location the single Adjust button targets while locations are hidden. */
  primaryLocationId?: string | null;
  /** Currencies for the adjust dialog's foreign-cost picker. */
  currencies?: CurrencyOption[];
};

export function StockSection({
  rows,
  partId,
  partName,
  locations,
  activeLocationIds,
  hideLocations = false,
  primaryLocationId = null,
  currencies = [],
}: Props) {
  if (hideLocations) {
    const total = rows.reduce((sum, r) => sum + r.quantityOnHand, 0);
    const lastMovementAt = rows.reduce<string | null>(
      (acc, r) =>
        r.lastMovementAt && (!acc || r.lastMovementAt > acc)
          ? r.lastMovementAt
          : acc,
      null,
    );
    return (
      <Section
        title="Stock"
        description="Live count from the inventory ledger."
      >
        <div className="flex items-center justify-between gap-4 rounded-md border p-4">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">On hand</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatQuantity(total)}
            </span>
            {lastMovementAt ? (
              <span className="text-muted-foreground text-xs">
                Last movement {formatDateTime(lastMovementAt)}
              </span>
            ) : null}
          </div>
          <AdjustStockDialog
            partId={partId}
            partName={partName}
            locations={locations}
            defaultLocationId={primaryLocationId ?? undefined}
            hideLocation
            currencies={currencies}
          />
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Stock by location"
      description="Live count from the inventory ledger. Locations with zero stock are still shown if they have any movement history."
    >
      {rows.length === 0 ? (
        <EmptyRow>No stock recorded at any location yet.</EmptyRow>
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Last movement
                </TableHead>
                <TableHead className="w-[90px] text-right sm:w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.locationId}>
                  <TableCell className="min-w-0 whitespace-normal">
                    <div className="flex flex-col">
                      <span className="font-medium break-words">
                        {row.locationName}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs break-all">
                        {row.locationCode}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatQuantity(row.quantityOnHand)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                    {formatDateTime(row.lastMovementAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {activeLocationIds.has(row.locationId) ? (
                      <AdjustStockDialog
                        partId={partId}
                        partName={partName}
                        locations={locations}
                        defaultLocationId={row.locationId}
                        triggerVariant="row"
                        currencies={currencies}
                      />
                    ) : (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled
                        title="Location is no longer active."
                      >
                        Adjust
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
