import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import {
  formatDate,
  formatFxRate,
  formatPct,
} from "@/lib/parts/format";
import { formatDkk, formatQuantity } from "@/lib/parts/stock";

import { EmptyRow, Section } from "./section";

export type PurchaseLineRow = {
  id: string;
  poId: string;
  poNumber: string;
  orderDate: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  fxRateToDkk: number;
  /** Decimal 0.10 = 10 %. Snapshot from PO line. */
  transportPct: number;
  /** Decimal — snapshot of the part's HS code duty at purchase time. */
  tariffPct: number;
  /** Decimal — anti-dumping snapshot (0 = none). */
  antiDumpingPct: number;
  landedCostDkkPerUnit: number;
};

type Props = {
  rows: PurchaseLineRow[];
  /** SKU of the part this page is showing; rendered on each row so an
   *  exported/printed view stays self-contained. */
  internalSku: string;
  /** Currently classified HS code for the part, shown under the import-tax
   *  cell. Null when the part isn't classified yet. */
  hsCode: string | null;
};

export async function PurchaseHistorySection({
  rows,
  internalSku,
  hsCode,
}: Props) {
  const t = await getTranslations("partDetail");
  return (
    <Section
      title={t("purchaseHistoryTitle")}
      description={t("purchaseHistoryDescription")}
      hue="buy"
    >
      {rows.length === 0 ? (
        <EmptyRow>{t("noPurchases")}</EmptyRow>
      ) : (
        <div className="bg-background overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thPartsNumber")}</TableHead>
                <TableHead className="hidden w-[110px] sm:table-cell">
                  {t("thOrderDate")}
                </TableHead>
                <TableHead className="text-right">{t("thQty")}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {t("thUnitPrice")}
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {t("thConversion")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("thTransport")}
                </TableHead>
                <TableHead className="text-right">{t("thImportTax")}</TableHead>
                <TableHead className="text-right">
                  {t("thAntiDumping")}
                </TableHead>
                <TableHead className="text-right">
                  {t("thLandedPerUnit")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                // Recompute the breakdown for display. The stored
                // landed_cost_dkk_per_unit is the authoritative source for the
                // total; the split is just `base × pct` per bucket.
                const baseDkk = row.unitPrice * row.fxRateToDkk;
                const transportDkk = baseDkk * row.transportPct;
                const importTaxDkk = baseDkk * row.tariffPct;
                const antiDumpingDkk = baseDkk * row.antiDumpingPct;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/purchase-orders/${row.poId}`}
                        className="hover:underline"
                        title={t("poTooltip", { number: row.poNumber })}
                      >
                        {internalSku}
                      </Link>
                      <div className="text-muted-foreground text-[10px]">
                        {row.poNumber}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                      {formatDate(row.orderDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.quantity)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      <Money
                        amount={row.unitPrice}
                        currency={row.currency}
                        fractionDigits={4}
                        bold={false}
                      />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {formatFxRate(row.fxRateToDkk)}
                      <div className="text-muted-foreground text-[10px]">
                        {row.currency} → DKK
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatDkk(transportDkk)}
                      <div className="text-muted-foreground text-[10px]">
                        {formatPct(row.transportPct)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.tariffPct > 0 ? (
                        <>
                          {formatDkk(importTaxDkk)}
                          <div className="text-muted-foreground font-mono text-[10px]">
                            {hsCode ? `${hsCode} · ` : ""}
                            {formatPct(row.tariffPct)}
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-muted-foreground">—</span>
                          <div className="text-muted-foreground text-[10px] italic">
                            {t("noHsCode")}
                          </div>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.antiDumpingPct > 0 ? (
                        <>
                          <span className="text-destructive">
                            {formatDkk(antiDumpingDkk)}
                          </span>
                          <div className="text-destructive font-mono text-[10px]">
                            {formatPct(row.antiDumpingPct)}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatDkk(row.landedCostDkkPerUnit)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
