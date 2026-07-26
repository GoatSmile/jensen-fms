import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatSignedQuantity } from "@/lib/parts/format";
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

export async function MovementsSection({
  rows,
  hideLocations = false,
}: {
  rows: MovementRow[];
  hideLocations?: boolean;
}) {
  const [t, tType] = await Promise.all([
    getTranslations("partDetail"),
    getTranslations("movementType"),
  ]);
  return (
    <Section
      title={t("movementsTitle")}
      description={t("movementsDescription")}
      hue="brand"
    >
      {rows.length === 0 ? (
        <EmptyRow>{t("noMovements")}</EmptyRow>
      ) : (
        <div className="bg-background overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[160px]">
                  {t("thWhen")}
                </TableHead>
                <TableHead>{t("thType")}</TableHead>
                {hideLocations ? null : (
                  <TableHead className="hidden sm:table-cell">
                    {t("thLocation")}
                  </TableHead>
                )}
                <TableHead className="text-right">{t("thDeltaQty")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("thUnitCost")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("thReasonSource")}
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
                      {tType.has(row.movementType)
                        ? tType(row.movementType)
                        : row.movementType}
                    </Badge>
                  </TableCell>
                  {hideLocations ? null : (
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
                      {row.locationCode}
                    </TableCell>
                  )}
                  <TableCell
                    className={`text-right tabular-nums font-medium ${
                      row.quantityDelta > 0
                        ? "text-good"
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
                        ? t("viaSource", { source: row.sourceEntityType })
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
