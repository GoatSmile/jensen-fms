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
import {
  MO_STATUS_VARIANT,
  moStatusLabel,
  type MOStatus,
} from "@/lib/mo/status";

export default async function ManufacturingOrdersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("manufacturing_orders")
    .select(
      `
        id, mo_number, status, target_quantity, completed_quantity,
        planned_start_date, planned_completion_date, notes,
        bike_type:bike_types(id, name_en),
        bike_template:bike_templates(id, name_en, family, frame_size, version),
        color:colors(id, name_en, hex)
      `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load manufacturing orders: ${error.message}`);
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
              <BreadcrumbPage>Manufacturing orders</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Manufacturing orders
            </h1>
            <p className="text-muted-foreground text-sm">
              {rows.length} {rows.length === 1 ? "order" : "orders"}
            </p>
          </div>
          <Button asChild>
            <Link href="/manufacturing-orders/new">
              <Plus aria-hidden /> New MO
            </Link>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
          No manufacturing orders yet. Create a template first, then start an
          MO against it — or go one-off and build the BOM by hand.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">MO number</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Colour</TableHead>
                <TableHead className="text-right">Target / done</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Planned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((mo) => {
                const tplLabel = mo.bike_template
                  ? [
                      mo.bike_template.family,
                      mo.bike_template.frame_size,
                      mo.bike_template.name_en,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : null;
                return (
                  <TableRow
                    key={mo.id}
                    className="hover:bg-muted/50 cursor-pointer"
                  >
                    <TableCell className="p-0 font-mono text-xs">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {mo.mo_number}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {tplLabel ? (
                          <>
                            <div className="font-medium">{tplLabel}</div>
                            <div className="text-muted-foreground text-xs">
                              v{mo.bike_template?.version}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">
                            One-off
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        <Badge variant="outline" className="font-normal">
                          {mo.bike_type?.name_en ?? "—"}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-sm">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {mo.color ? (
                          <span className="inline-flex items-center gap-2">
                            {mo.color.hex ? (
                              <span
                                aria-hidden
                                className="border-border inline-block size-3 rounded-full border"
                                style={{ backgroundColor: mo.color.hex }}
                              />
                            ) : null}
                            {mo.color.name_en}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right tabular-nums">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        <span className="font-medium">
                          {mo.completed_quantity}
                        </span>
                        <span className="text-muted-foreground"> / </span>
                        <span>{mo.target_quantity}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        <Badge
                          variant={
                            MO_STATUS_VARIANT[mo.status as MOStatus] ??
                            "outline"
                          }
                        >
                          {moStatusLabel(mo.status)}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground p-0 text-xs">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {formatDate(mo.planned_start_date)}
                        {mo.planned_completion_date ? (
                          <> – {formatDate(mo.planned_completion_date)}</>
                        ) : null}
                      </Link>
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
