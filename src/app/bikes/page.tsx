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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import {
  BIKE_STATUS_VARIANT,
  bikeStatusLabel,
  type BikeStatus,
} from "@/lib/bikes/status";

type SearchParams = {
  q?: string;
  status?: string;
  type?: string;
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

  const supabase = await createClient();

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
        bike_model:bike_models(id, name_en),
        bike_model_variant:bike_model_variants(id, name_en, sku)
      `,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("frame_number", { ascending: true });

  if (statusFilter) bikesQuery = bikesQuery.eq("status", statusFilter);
  if (typeFilter) bikesQuery = bikesQuery.eq("bike_type_id", typeFilter);
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
              <BreadcrumbPage>Bikes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-end justify-between gap-4">
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
              <Plus aria-hidden /> Add bike
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
            className="font-mono"
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
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
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
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
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
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
          {filterDescriptors.length > 0
            ? "No bikes match these filters."
            : "No bikes yet. Add a manual bike, or wait for the manufacturing-order build flow in Phase 2C."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Frame number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow
                  key={b.id}
                  className="hover:bg-muted/50 cursor-pointer"
                >
                  <TableCell className="p-0 font-mono text-xs">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                      {b.frame_number}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                      <Badge variant="outline" className="font-normal">
                        {b.bike_type?.name_en ?? "—"}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5 text-sm">
                      {b.bike_model?.name_en ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground p-0 text-xs">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                      {b.bike_model_variant?.name_en ?? "—"}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
