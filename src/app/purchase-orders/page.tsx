import Link from "next/link";

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
    <div className="flex flex-1 flex-col gap-6 p-6">
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
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
          No purchase orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">PO</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead className="text-right">Total</TableHead>
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
                  <TableCell className="p-0">
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
                  <TableCell className="text-muted-foreground p-0 text-xs">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatDate(po.order_date)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground p-0 text-xs">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatDate(po.expected_date)}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-right tabular-nums">
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
