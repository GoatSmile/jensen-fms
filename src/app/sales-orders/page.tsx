import Link from "next/link";
import { Plus, Receipt } from "lucide-react";

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
import { SegmentedId } from "@/components/segmented-id";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatDeliveryTarget } from "@/lib/iso-week";
import { formatPrice } from "@/lib/format";
import {
  SO_STATUS_VARIANT,
  soStatusLabel,
  type SOStatus,
} from "@/lib/so/status";

export const dynamic = "force-dynamic";

export default async function SalesOrdersListPage() {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, status, order_date, requested_delivery_date,
       requested_delivery_precision, total_amount, currency,
       organization:organizations!organization_id(id, legal_name, display_name_en, display_name_da)`,
    )
    .order("order_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to load sales orders: ${error.message}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Sales orders</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Sales orders</h1>
          <p className="text-muted-foreground text-sm">
            Customer commitments. A confirmed SO slates bikes in linked MOs to
            the customer; delivery flips them to assigned.
          </p>
        </div>
        <Button asChild>
          <Link href="/sales-orders/new">
            <Plus aria-hidden /> New sales order
          </Link>
        </Button>
      </div>

      {!rows || rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No sales orders yet"
          description="Create a sales order to quote, build, and deliver bikes for a customer."
          action={{ label: "New sales order", href: "/sales-orders/new" }}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SO</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">
                  Order date
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Expected delivery
                </TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((so) => {
                const customer =
                  so.organization?.display_name_da ??
                  so.organization?.display_name_en ??
                  so.organization?.legal_name ??
                  "—";
                return (
                  <TableRow key={so.id} className="hover:bg-muted/50">
                    <TableCell className="p-0 text-xs">
                      <Link
                        href={`/sales-orders/${so.id}`}
                        className="block px-4 py-2.5 hover:underline"
                      >
                        <SegmentedId value={so.sales_order_number} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/sales-orders/${so.id}`}
                        className="block px-4 py-2.5 text-sm hover:underline"
                      >
                        {customer}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          SO_STATUS_VARIANT[so.status as SOStatus] ?? "outline"
                        }
                      >
                        {soStatusLabel(so.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                      {formatDate(so.order_date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                      {formatDeliveryTarget(
                        so.requested_delivery_date,
                        so.requested_delivery_precision,
                      ) ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {so.total_amount != null
                        ? formatPrice(Number(so.total_amount), so.currency)
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
