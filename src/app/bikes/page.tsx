import Link from "next/link";
import { Bike, Plus } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColorSwatch } from "@/components/color-swatch";
import { colorFinishLabel } from "@/lib/colors/coating";
import { EmptyState } from "@/components/empty-state";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { FILTER_ACTIVE_CLASS } from "@/lib/filter-style";
import {
  BIKE_STATUS_VARIANT,
  bikeStatusLabel,
  type BikeStatus,
} from "@/lib/bikes/status";

type SearchParams = {
  q?: string;
  status?: string;
  type?: string;
  "has-part"?: string;
};

const STATUS_OPTIONS: BikeStatus[] = [
  "planning",
  "building",
  "in_stock",
  "assigned",
  "in_service",
  "in_maintenance",
  "retired",
  "lost_or_stolen",
];

export default async function BikesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const statusFilter = sp.status && STATUS_OPTIONS.includes(sp.status as BikeStatus)
    ? (sp.status as BikeStatus)
    : null;
  const typeFilter = sp.type && sp.type !== "all" ? sp.type : null;
  const hasPartId = sp["has-part"] && sp["has-part"] !== "all" ? sp["has-part"] : null;

  const supabase = await createClient();

  // If filtering by a part, pre-collect bike_ids that have that part installed
  // and not removed. PostgREST can't filter outer rows by an embedded column,
  // so we resolve to a list of ids and pass that to the main query.
  let bikeIdsForPart: string[] | null = null;
  let hasPartName: string | null = null;
  if (hasPartId) {
    const [{ data: bp }, { data: partRow }] = await Promise.all([
      supabase
        .from("bike_parts")
        .select("bike_id")
        .eq("part_id", hasPartId)
        .is("removed_at", null),
      supabase
        .from("parts")
        .select("internal_sku, name_en")
        .eq("id", hasPartId)
        .maybeSingle(),
    ]);
    bikeIdsForPart = Array.from(new Set((bp ?? []).map((r) => r.bike_id)));
    // bikes.id is uuid, so PostgREST `id.in.(...)` rejects a non-uuid sentinel.
    // The zero-uuid is guaranteed not to match a real row.
    if (bikeIdsForPart.length === 0)
      bikeIdsForPart = ["00000000-0000-0000-0000-000000000000"];
    hasPartName = partRow ? `${partRow.name_en} (${partRow.internal_sku})` : null;
  }

  let bikesQuery = supabase
    .from("bikes")
    .select(
      `
        id,
        frame_number,
        status,
        notes,
        deleted_at,
        bike_type:bike_types(id, name_en),
        template:bike_templates(id, name_en, family, frame_size, version),
        color:colors(id, name_en, hex, ral_code, coating),
        manufacturing_order:manufacturing_orders(
          id,
          sales_order:sales_orders!sales_order_id(id, sales_order_number)
        ),
        owner_organization:organizations!owner_organization_id(
          id, legal_name, display_name_en, display_name_da
        )
      `,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("frame_number", { ascending: true });

  if (statusFilter) bikesQuery = bikesQuery.eq("status", statusFilter);
  if (typeFilter) bikesQuery = bikesQuery.eq("bike_type_id", typeFilter);
  if (bikeIdsForPart) bikesQuery = bikesQuery.in("id", bikeIdsForPart);
  if (q) {
    bikesQuery = bikesQuery.ilike("frame_number", `%${q}%`);
  }

  const [bikesRes, typesRes] = await Promise.all([
    bikesQuery,
    supabase
      .from("bike_types")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (bikesRes.error) {
    throw new Error(`Failed to load bikes: ${bikesRes.error.message}`);
  }

  const rows = bikesRes.data ?? [];
  const totalCount = bikesRes.count ?? rows.length;

  const filterDescriptors: string[] = [];
  if (statusFilter) filterDescriptors.push(bikeStatusLabel(statusFilter).toLowerCase());
  if (typeFilter) {
    const t = typesRes.data?.find((x) => x.id === typeFilter);
    if (t) filterDescriptors.push(t.name_en.toLowerCase());
  }
  if (q) filterDescriptors.push(`matching "${q}"`);
  if (hasPartName) filterDescriptors.push(`with ${hasPartName} installed`);

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
              <BreadcrumbPage>Bikes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bikes</h1>
            <p className="text-muted-foreground text-sm">
              {totalCount} {totalCount === 1 ? "bike" : "bikes"}
              {filterDescriptors.length > 0
                ? ` · ${filterDescriptors.join(" · ")}`
                : ""}
            </p>
          </div>
          <Button asChild>
            <Link href="/bikes/new">
              <Plus aria-hidden /> New bike
            </Link>
          </Button>
        </div>
      </header>

      <form
        method="get"
        className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="bikes-q">
            Search frame number
          </label>
          <Input
            id="bikes-q"
            name="q"
            defaultValue={q}
            placeholder="JP-2026-HSB-…"
            className={cn("font-mono", q && FILTER_ACTIVE_CLASS)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="bikes-status">
            Status
          </label>
          <select
            id="bikes-status"
            name="status"
            defaultValue={statusFilter ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              statusFilter && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {bikeStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="bikes-type">
            Type
          </label>
          <select
            id="bikes-type"
            name="type"
            defaultValue={typeFilter ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              typeFilter && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">All types</option>
            {(typesRes.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name_en}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end justify-end sm:col-span-3">
          <Button type="submit" size="sm" variant="outline">
            Apply
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        filterDescriptors.length > 0 ? (
          <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
            No bikes match these filters.
          </div>
        ) : (
          <EmptyState
            icon={Bike}
            title="No bikes yet"
            description="Add a manual bike, or create one through a manufacturing order."
            action={{ label: "New bike", href: "/bikes/new" }}
            secondaryAction={{
              label: "Start a manufacturing order",
              href: "/manufacturing-orders/new",
            }}
          />
        )
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px] sm:w-[200px]">
                  Frame number
                </TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Template</TableHead>
                <TableHead className="hidden lg:table-cell">Colour</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="hidden xl:table-cell">Sales order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow
                  key={b.id}
                  className="hover:bg-muted/50 cursor-pointer"
                >
                  <TableCell className="p-0 text-xs">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                      <SegmentedId value={b.frame_number} />
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 md:table-cell">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                      <Badge variant="outline" className="font-normal">
                        {b.bike_type?.name_en ?? "—"}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 md:table-cell">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5 text-sm">
                      {b.template ? (
                        <>
                          <div className="font-medium">
                            {[b.template.family, b.template.frame_size, b.template.name_en]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            v{b.template.version}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 lg:table-cell">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5 text-sm">
                      {b.color ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ColorSwatch
                            hex={b.color.hex}
                            label={b.color.name_en}
                          />
                          <span className="flex flex-col leading-tight">
                            <span>{b.color.name_en}</span>
                            {colorFinishLabel(
                              b.color.ral_code,
                              b.color.coating,
                            ) ? (
                              <span className="text-muted-foreground text-xs">
                                {colorFinishLabel(
                                  b.color.ral_code,
                                  b.color.coating,
                                )}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                      <Badge
                        variant={
                          BIKE_STATUS_VARIANT[b.status as BikeStatus] ??
                          "outline"
                        }
                      >
                        {bikeStatusLabel(b.status)}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 lg:table-cell">
                    {b.owner_organization ? (
                      <Link
                        href={`/organizations/${b.owner_organization.id}`}
                        className="block px-4 py-2.5 text-sm hover:underline"
                      >
                        {b.owner_organization.display_name_da ??
                          b.owner_organization.display_name_en ??
                          b.owner_organization.legal_name}
                      </Link>
                    ) : (
                      <Link
                        href={`/bikes/${b.id}`}
                        className="text-muted-foreground block px-4 py-2.5 text-sm"
                      >
                        —
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="hidden p-0 xl:table-cell">
                    {b.manufacturing_order?.sales_order ? (
                      <Link
                        href={`/sales-orders/${b.manufacturing_order.sales_order.id}`}
                        className="block px-4 py-2.5 font-mono text-xs hover:underline"
                      >
                        {b.manufacturing_order.sales_order.sales_order_number}
                      </Link>
                    ) : (
                      <Link
                        href={`/bikes/${b.id}`}
                        className="text-muted-foreground block px-4 py-2.5 text-sm"
                      >
                        —
                      </Link>
                    )}
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
