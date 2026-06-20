import Link from "next/link";

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
  PAINT_ORDER_STATUS_VARIANT,
  paintOrderStatusLabel,
  type PaintOrderStatus,
} from "@/lib/paint/status";

export type LinkedPaintRow = {
  id: string;
  paint_order_number: string;
  status: PaintOrderStatus;
  colorName: string | null;
  colorHex: string | null;
  supplierName: string | null;
  bikeCount: number;
};

export function LinkedPaintOrdersSection({
  soId,
  rows,
  canCreate,
}: {
  soId: string;
  rows: LinkedPaintRow[];
  canCreate: boolean;
}) {
  return (
    <section className="rounded-md border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Paint orders</h2>
          <p className="text-muted-foreground text-xs">
            Paint batches created from this SO&apos;s frames. A frame at the
            painter can&apos;t be built until it&apos;s received back.
          </p>
        </div>
        {canCreate ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/sales-orders/${soId}/paint/new`}>New paint order</Link>
          </Button>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No paint orders yet
          {canCreate ? " — send a batch of frames to the painter above." : "."}
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paint order</TableHead>
                <TableHead className="hidden md:table-cell">Supplier</TableHead>
                <TableHead>Colour</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Frames</TableHead>
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
                      {po.paint_order_number}
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
                      variant={PAINT_ORDER_STATUS_VARIANT[po.status] ?? "outline"}
                    >
                      {paintOrderStatusLabel(po.status)}
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
    </section>
  );
}
