import Link from "next/link";
import { Plus } from "lucide-react";

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
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import {
  PAINT_ORDER_STATUS_VARIANT,
  paintOrderStatusLabel,
  type PaintOrderStatus,
} from "@/lib/paint/status";

const STATUS_OPTIONS: PaintOrderStatus[] = [
  "planned",
  "sent_to_painter",
  "at_painter",
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
  const statusFilter =
    sp.status && STATUS_OPTIONS.includes(sp.status as PaintOrderStatus)
      ? (sp.status as PaintOrderStatus)
      : null;

  const supabase = await createClient();
  let q = supabase
    .from("paint_orders")
    .select(
      `
        id, paint_order_number, status, planned_send_date, sent_at,
        received_at, unit_cost, unit_cost_currency,
        supplier:suppliers(id, name),
        color:colors(id, name_en, hex)
      `,
    )
    .order("created_at", { ascending: false });

  if (statusFilter) q = q.eq("status", statusFilter);

  const { data: rows, error } = await q;
  if (error) {
    throw new Error(`Failed to load paint orders: ${error.message}`);
  }

  // Count bikes per paint order in one round-trip, then bucket by id.
  const orderIds = (rows ?? []).map((r) => r.id);
  const bikeCountByOrder = new Map<string, number>();
  if (orderIds.length > 0) {
    const { data: linkRows } = await supabase
      .from("paint_order_bikes")
      .select("paint_order_id")
      .in("paint_order_id", orderIds);
    for (const r of linkRows ?? []) {
      bikeCountByOrder.set(
        r.paint_order_id,
        (bikeCountByOrder.get(r.paint_order_id) ?? 0) + 1,
      );
    }
  }

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
              <BreadcrumbPage>Paint orders</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Paint orders
            </h1>
            <p className="text-muted-foreground text-sm">
              {(rows ?? []).length}{" "}
              {(rows ?? []).length === 1 ? "order" : "orders"}
              {statusFilter ? (
                <>
                  {" · "}
                  {paintOrderStatusLabel(statusFilter).toLowerCase()}
                  {" · "}
                  <Link
                    href="/paint-orders"
                    className="hover:text-foreground underline-offset-4 hover:underline"
                  >
                    clear filter
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          <Button asChild>
            <Link href="/paint-orders/new">
              <Plus aria-hidden /> New paint order
            </Link>
          </Button>
        </div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="paint-status">
            Status
          </label>
          <select
            id="paint-status"
            name="status"
            defaultValue={statusFilter ?? ""}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {paintOrderStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
      </form>

      {(rows ?? []).length === 0 ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
          No paint orders yet. Start one to batch up bikes that need painting.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Colour</TableHead>
                <TableHead className="text-right">Bikes</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/50 cursor-pointer">
                  <TableCell className="p-0 font-mono text-xs">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {r.paint_order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      <Badge
                        variant={
                          PAINT_ORDER_STATUS_VARIANT[
                            r.status as PaintOrderStatus
                          ] ?? "outline"
                        }
                      >
                        {paintOrderStatusLabel(r.status)}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-sm">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {r.supplier?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-sm">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {r.color ? (
                        <span className="inline-flex items-center gap-2">
                          {r.color.hex ? (
                            <span
                              aria-hidden
                              className="border-border inline-block size-3 rounded-full border"
                              style={{ backgroundColor: r.color.hex }}
                            />
                          ) : null}
                          {r.color.name_en}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-right tabular-nums">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {bikeCountByOrder.get(r.id) ?? 0}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground p-0 text-xs">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatDate(r.sent_at)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground p-0 text-xs">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatDate(r.received_at)}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-right text-sm tabular-nums">
                    <Link
                      href={`/paint-orders/${r.id}`}
                      className="block px-4 py-2.5"
                    >
                      {formatPrice(
                        r.unit_cost == null ? null : Number(r.unit_cost),
                        r.unit_cost_currency,
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
