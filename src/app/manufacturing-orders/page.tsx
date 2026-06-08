import Link from "next/link";
import { Hammer, Plus } from "lucide-react";

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
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import {
  MO_STATUS_VARIANT,
  OPEN_MO_STATUSES,
  moStatusLabel,
  type MOStatus,
} from "@/lib/mo/status";
import { cn } from "@/lib/utils";

/** Inset 3px left stripe; cn-friendly. */
const OVERDUE_BORDER = "shadow-[inset_3px_0_0_var(--destructive)]";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isMOOverdue(
  status: string,
  plannedCompletionDate: string | null,
  today: string,
): boolean {
  if (!plannedCompletionDate) return false;
  if (!OPEN_MO_STATUSES.includes(status as MOStatus)) return false;
  return plannedCompletionDate < today;
}

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
  const today = todayISODate();

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
              <BreadcrumbPage>Manufacturing orders</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
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
        <EmptyState
          icon={Hammer}
          title="No manufacturing orders yet"
          description="Start a production run against a template — or go one-off and build the BOM by hand."
          action={{ label: "New MO", href: "/manufacturing-orders/new" }}
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[180px]">
                  MO number
                </TableHead>
                <TableHead className="hidden md:table-cell">Template</TableHead>
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Colour</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Target / done
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Planned</TableHead>
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
                const overdue = isMOOverdue(
                  mo.status,
                  mo.planned_completion_date,
                  today,
                );
                return (
                  <TableRow
                    key={mo.id}
                    className={cn(
                      "hover:bg-muted/50 cursor-pointer",
                      overdue && OVERDUE_BORDER,
                    )}
                  >
                    <TableCell className="p-0 text-xs">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        <SegmentedId value={mo.mo_number} />
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 md:table-cell">
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
                    <TableCell className="hidden p-0 lg:table-cell">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        <Badge variant="outline" className="font-normal">
                          {mo.bike_type?.name_en ?? "—"}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-sm lg:table-cell">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {mo.color ? (
                          <ColorChip
                            hex={mo.color.hex}
                            label={mo.color.name_en}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums md:table-cell">
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
                    <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
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
