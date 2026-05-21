import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDateTime,
  formatSignedQuantity,
  movementTypeLabel,
} from "@/lib/parts/format";
import { formatDkk } from "@/lib/parts/stock";

import { EmptyRow, Section } from "./section";

export type MovementRow = {
  id: string;
  occurredAt: string;
  movementType: string;
  locationCode: string;
  locationName: string;
  quantityDelta: number;
  unitCostDkk: number | null;
  reason: string | null;
  sourceEntityType: string | null;
};

const MOVEMENT_BADGE_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "outline" | "secondary"
> = {
  received: "success",
  consumed_build: "secondary",
  consumed_maintenance: "secondary",
  returned_to_supplier: "warning",
  adjustment: "outline",
  transfer_in: "outline",
  transfer_out: "outline",
  disposed: "destructive",
};

export function MovementsSection({ rows }: { rows: MovementRow[] }) {
  return (
    <Section
      title="Recent movements"
      description="Last 50 inventory movements affecting this part. Each row is an immutable ledger entry."
    >
      {rows.length === 0 ? (
        <EmptyRow>No inventory movements yet.</EmptyRow>
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[160px]">When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Location</TableHead>
                <TableHead className="text-right">Δ qty</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Unit cost (DKK)
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Reason / source
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDateTime(row.occurredAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        MOVEMENT_BADGE_VARIANT[row.movementType] ?? "outline"
                      }
                    >
                      {movementTypeLabel(row.movementType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs sm:table-cell">
                    {row.locationCode}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-medium ${
                      row.quantityDelta > 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : row.quantityDelta < 0
                          ? "text-destructive"
                          : ""
                    }`}
                  >
                    {formatSignedQuantity(row.quantityDelta)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {formatDkk(row.unitCostDkk)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-[320px] truncate text-xs lg:table-cell">
                    {row.reason ??
                      (row.sourceEntityType
                        ? `(via ${row.sourceEntityType})`
                        : "—")}
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
