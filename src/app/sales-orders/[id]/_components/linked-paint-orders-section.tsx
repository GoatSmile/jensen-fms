import Link from "next/link";

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
  serviceOrderStatusLabel,
  type ServiceOrderStatus,
} from "@/lib/services/status";
import { PAINT_SUPPLIER_NOUN } from "@/lib/services/vocab";

export type LinkedPaintRow = {
  id: string;
  order_number: string;
  status: ServiceOrderStatus;
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
    <Section
      title="Paint orders"
      description="Paint batches created from this SO's frames. A frame at the painter can't be built until it's received back."
      className="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20"
      action={
        canCreate ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/sales-orders/${soId}/paint/new`}>New paint order</Link>
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          No paint orders yet
          {canCreate ? " — send a batch of frames to the painter above." : "."}
        </p>
      ) : (
        <div className="bg-background overflow-x-auto rounded-md border md:overflow-hidden">
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
                      {serviceOrderStatusLabel(po.status, PAINT_SUPPLIER_NOUN)}
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
