import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Paintbrush, Plus } from "lucide-react";

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
import { ColorChip } from "@/components/color-swatch";
import { EmptyState } from "@/components/empty-state";
import { SegmentedId } from "@/components/segmented-id";
import { colorFinishLabel } from "@/lib/colors/coating";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { FILTER_ACTIVE_CLASS } from "@/lib/filter-style";
import { formatDate } from "@/lib/parts/format";
import {
  SERVICE_ORDER_STATUS_VARIANT,
  type ServiceOrderStatus,
} from "@/lib/services/status";
import { PAINT_SERVICE_SLUG } from "@/lib/services/vocab";

const STATUS_OPTIONS: ServiceOrderStatus[] = [
  "planned",
  "sent",
  "at_supplier",
  "received_back",
  "cancelled",
];

type SearchParams = {
  status?: string;
};

export default async function PaintOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const [t, tCommon, tStatus] = await Promise.all([
    getTranslations("paintOrders"),
    getTranslations("common"),
    getTranslations("serviceOrderStatus"),
  ]);
  const svcStatus = (s: string) => (tStatus.has(s) ? tStatus(s) : s);
  const statusFilter =
    sp.status && STATUS_OPTIONS.includes(sp.status as ServiceOrderStatus)
      ? (sp.status as ServiceOrderStatus)
      : null;

  const supabase = await createClient();
  // This surface is the PAINTING type's list (surfaces are per service type;
  // a future washing/sandblasting gets its own route + nav item).
  let q = supabase
    .from("service_orders")
    .select(
      `
        id, order_number, status, planned_send_date, sent_at, received_at,
        service_type:service_types!inner(slug),
        supplier:suppliers(id, name),
        color:colors(id, name_en, hex, ral_code, coating)
      `,
    )
    .eq("service_type.slug", PAINT_SERVICE_SLUG)
    .order("created_at", { ascending: false });

  if (statusFilter) q = q.eq("status", statusFilter);

  const { data: rows, error } = await q;
  if (error) {
    throw new Error(`Failed to load paint orders: ${error.message}`);
  }

  // Count bikes per order in one round-trip, then bucket by id.
  const orderIds = (rows ?? []).map((r) => r.id);
  const bikeCountByOrder = new Map<string, number>();
  if (orderIds.length > 0) {
    const { data: linkRows } = await supabase
      .from("service_order_bikes")
      .select("service_order_id")
      .in("service_order_id", orderIds);
    for (const r of linkRows ?? []) {
      bikeCountByOrder.set(
        r.service_order_id,
        (bikeCountByOrder.get(r.service_order_id) ?? 0) + 1,
      );
    }
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("count", { count: (rows ?? []).length })}
              {statusFilter ? (
                <>
                  {" · "}
                  {svcStatus(statusFilter).toLowerCase()}
                  {" · "}
                  <Link
                    href="/paint-orders"
                    className="hover:text-foreground underline-offset-4 hover:underline"
                  >
                    {t("clearFilter")}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          <Button asChild>
            <Link href="/paint-orders/new">
              <Plus aria-hidden /> {t("newPaintOrder")}
            </Link>
          </Button>
        </div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="paint-status">
            {t("filterStatus")}
          </label>
          <select
            id="paint-status"
            name="status"
            defaultValue={statusFilter ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              statusFilter && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">{t("allStatuses")}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {svcStatus(s)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" variant="outline">
          {tCommon("apply")}
        </Button>
      </form>

      {(rows ?? []).length === 0 ? (
        statusFilter ? (
          <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
            {t("noMatchFilter")}
          </div>
        ) : (
          <EmptyState
            icon={Paintbrush}
            title={t("emptyTitle")}
            description={t("emptyDesc")}
            action={{ label: t("newPaintOrder"), href: "/paint-orders/new" }}
          />
        )
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[160px]">
                  {t("thNumber")}
                </TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thSupplier")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thColour")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("thBikes")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("thSent")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("thReturned")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/50 cursor-pointer">
                  <TableCell className="p-0 text-xs">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      <SegmentedId value={r.order_number} />
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      <Badge
                        variant={
                          SERVICE_ORDER_STATUS_VARIANT[
                            r.status as ServiceOrderStatus
                          ] ?? "outline"
                        }
                      >
                        {svcStatus(r.status)}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 text-sm md:table-cell">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {r.supplier?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 text-sm md:table-cell">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {r.color ? (
                        <span className="flex flex-col gap-0.5">
                          <ColorChip
                            hex={r.color.hex}
                            label={r.color.name_en}
                          />
                          {colorFinishLabel(
                            r.color.ral_code,
                            r.color.coating,
                          ) ? (
                            <span className="text-muted-foreground text-xs">
                              {colorFinishLabel(
                                r.color.ral_code,
                                r.color.coating,
                              )}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 text-right tabular-nums md:table-cell">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {bikeCountByOrder.get(r.id) ?? 0}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden p-0 text-xs lg:table-cell">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatDate(r.sent_at)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden p-0 text-xs lg:table-cell">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatDate(r.received_at)}
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
