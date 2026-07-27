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
import { Money } from "@/components/money";
import { formatDate } from "@/lib/parts/format";

import { EmptyRow, Section } from "./section";

export type PricingRow = {
  id: string;
  price: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isCurrent: boolean;
};

export async function PricingHistorySection({ rows }: { rows: PricingRow[] }) {
  const t = await getTranslations("partDetail");
  return (
    <Section
      title={t("pricingTitle")}
      description={t("pricingDescription")}
    >
      {rows.length === 0 ? (
        <EmptyRow>{t("noPricing")}</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]" />
              <TableHead className="text-right">{t("thPrice")}</TableHead>
              <TableHead>{t("thFrom")}</TableHead>
              <TableHead>{t("thTo")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.isCurrent ? (
                    <Badge variant="success">{t("currentBadge")}</Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  <Money
                    amount={row.price}
                    currency={row.currency}
                    bold={false}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatDate(row.effectiveFrom)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {row.effectiveTo ? formatDate(row.effectiveTo) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}
