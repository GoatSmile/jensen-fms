import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClipboardList, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { Money } from "@/components/money";
import { SegmentedId } from "@/components/segmented-id";
import { formatDate } from "@/lib/parts/format";
import {
  PO_STATUS_VARIANT,
  type PurchaseOrderStatus,
} from "@/lib/po/status";

export default async function PurchaseOrdersPage() {
  const [t, tCommon, tStatus] = await Promise.all([
    getTranslations("po"),
    getTranslations("common"),
    getTranslations("poStatus"),
  ]);
  const supabase = await createClient();
  const [poRes, totalsRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        `
        id,
        po_number,
        status,
        order_date,
        expected_date,
        received_date,
        suppliers(id, name)
      `,
      )
      .order("order_date", { ascending: false }),
    // Landed totals computed from the lines (includes transport, tariff and
    // anti-dumping, unified in DKK) — see v_po_totals. Avoids relying on the
    // stored total_amount, which is null for imported POs.
    supabase.from("v_po_totals").select("purchase_order_id, landed_total_dkk"),
  ]);

  if (poRes.error) {
    throw new Error(`Failed to load purchase orders: ${poRes.error.message}`);
  }

  const rows = poRes.data ?? [];
  const landedByPo = new Map<string, number>();
  for (const t of totalsRes.data ?? []) {
    if (t.purchase_order_id != null && t.landed_total_dkk != null)
      landedByPo.set(t.purchase_order_id, Number(t.landed_total_dkk));
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{tCommon("crumbDashboard")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("title")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("count", { count: rows.length })}
            </p>
          </div>
          <Button asChild>
            <Link href="/purchase-orders/new">
              <Plus aria-hidden /> {t("newPo")}
            </Link>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
          action={{ label: t("newPo"), href: "/purchase-orders/new" }}
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px] sm:w-[200px]">
                  {t("thPo")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thSupplier")}
                </TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thOrdered")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("thExpected")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("thLandedTotal")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((po) => (
                <TableRow
                  key={po.id}
                  className="hover:bg-muted/50 cursor-pointer"
                >
                  <TableCell className="p-0">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="block px-4 py-2.5 text-xs"
                    >
                      <SegmentedId value={po.po_number} />
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 md:table-cell">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="block px-4 py-2.5"
                    >
                      {po.suppliers?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="block px-4 py-2.5"
                    >
                      <Badge
                        variant={
                          PO_STATUS_VARIANT[po.status as PurchaseOrderStatus] ??
                          "outline"
                        }
                      >
                        {tStatus.has(po.status) ? tStatus(po.status) : po.status}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatDate(po.order_date)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden p-0 text-xs lg:table-cell">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatDate(po.expected_date)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 text-right tabular-nums md:table-cell">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="block px-4 py-2.5"
                    >
                      <Money
                        amount={landedByPo.get(po.id) ?? null}
                        currency="DKK"
                        bold={false}
                      />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
