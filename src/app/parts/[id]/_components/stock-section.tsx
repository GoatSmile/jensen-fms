import { getTranslations } from "next-intl/server";

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

export async function StockSection({
  rows,
  partId,
  partName,
  locations,
  activeLocationIds,
  hideLocations = false,
  primaryLocationId = null,
  currencies = [],
}: Props) {
  const t = await getTranslations("partDetail");
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
        title={t("stockTitle")}
        description={t("stockDescriptionSingle")}
        hue="brand"
      >
        <div className="bg-background flex items-center justify-between gap-4 rounded-md border p-4">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">
              {t("onHand")}
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatQuantity(total)}
            </span>
            {lastMovementAt ? (
              <span className="text-muted-foreground text-xs">
                {t("lastMovementAt", {
                  date: formatDateTime(lastMovementAt),
                })}
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
      title={t("stockByLocation")}
      description={t("stockByLocationDescription")}
      hue="brand"
    >
      {rows.length === 0 ? (
        <EmptyRow>{t("noStock")}</EmptyRow>
      ) : (
        <div className="bg-background overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thLocation")}</TableHead>
                <TableHead className="text-right">{t("thOnHand")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t("thLastMovement")}
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
                        title={t("locationInactive")}
                      >
                        {t("adjust")}
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
