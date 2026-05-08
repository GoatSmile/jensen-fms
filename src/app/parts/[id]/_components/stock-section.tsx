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
};

export function StockSection({
  rows,
  partId,
  partName,
  locations,
  activeLocationIds,
}: Props) {
  return (
    <Section
      title="Stock by location"
      description="Live count from the inventory ledger. Locations with zero stock are still shown if they have any movement history."
    >
      {rows.length === 0 ? (
        <EmptyRow>No stock recorded at any location yet.</EmptyRow>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead>Last movement</TableHead>
                <TableHead className="w-[120px] text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.locationId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.locationName}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {row.locationCode}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatQuantity(row.quantityOnHand)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
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
