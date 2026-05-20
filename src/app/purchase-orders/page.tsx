import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { formatDate, formatMoney } from "@/lib/parts/format";
import {
  PO_STATUS_VARIANT,
  poStatusLabel,
  type PurchaseOrderStatus,
} from "@/lib/po/status";

export default async function PurchaseOrdersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      `
        id,
        po_number,
        status,
        order_date,
        expected_date,
        received_date,
        total_amount,
        total_currency,
        suppliers(id, name)
      `,
    )
    .order("order_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to load purchase orders: ${error.message}`);
  }

  const rows = data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Purchase orders</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Purchase orders
          </h1>
          <p className="text-muted-foreground text-sm">
            {rows.length} {rows.length === 1 ? "order" : "orders"}
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No purchase orders yet"
          description="Create a purchase order to track incoming shipments and receive stock against catalog parts."
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px] sm:w-[200px]">PO</TableHead>
                <TableHead className="hidden md:table-cell">Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Ordered</TableHead>
                <TableHead className="hidden lg:table-cell">Expected</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Total
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
                      className="block px-4 py-2.5 font-mono text-xs"
                    >
                      {po.po_number}
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
                        {poStatusLabel(po.status)}
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
                      {formatMoney(
                        po.total_amount != null
                          ? Number(po.total_amount)
                          : null,
                        po.total_currency,
                      )}
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
