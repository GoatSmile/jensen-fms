import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColorChip } from "@/components/color-swatch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SERVICE_ORDER_STATUS_VARIANT,
  type ServiceOrderStatus,
} from "@/lib/services/status";

export type LinkedPaintRow = {
  id: string;
  order_number: string;
  status: ServiceOrderStatus;
  colorName: string | null;
  colorHex: string | null;
  supplierName: string | null;
  bikeCount: number;
};

export async function LinkedPaintOrdersSection({
  soId,
  rows,
  canCreate,
}: {
  soId: string;
  rows: LinkedPaintRow[];
  canCreate: boolean;
}) {
  const [t, tSvcStatus] = await Promise.all([
    getTranslations("soDetail"),
    getTranslations("serviceOrderStatus"),
  ]);
  return (
    <Section
      title={t("linkedPaintTitle")}
      description={t("linkedPaintDesc")}
      hue="brand"
      action={
        canCreate ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/sales-orders/${soId}/paint/new`}>
              {t("newPaintOrder")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          {t("noPaintOrders")}
          {canCreate ? t("noPaintOrdersCta") : "."}
        </p>
      ) : (
        <div className="bg-background overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thPaintOrder")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thSupplier")}
                </TableHead>
                <TableHead>{t("thColour")}</TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="text-right">{t("thFrames")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((po) => (
                <TableRow key={po.id} className="hover:bg-muted/50">
                  <TableCell className="p-0 font-mono text-xs">
                    <Link
                      href={`/paint-orders/${po.id}`}
                      className="block px-4 py-2.5 hover:underline"
                    >
                      {po.order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {po.supplierName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {po.colorName ? (
                      <ColorChip hex={po.colorHex} label={po.colorName} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={SERVICE_ORDER_STATUS_VARIANT[po.status] ?? "outline"}
                    >
                      {tSvcStatus.has(po.status)
                        ? tSvcStatus(po.status)
                        : po.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {po.bikeCount}
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
