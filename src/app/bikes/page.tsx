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
import { formatDate } from "@/lib/parts/format";
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
  owner?: string;
  template?: string;
  built?: string;
  fleet?: string;
  sort?: string;
};

const BUILT_PRESETS: { value: string; label: string }[] = [
  { value: "this-year", label: "Built this year" },
  { value: "last-12m", label: "Built in last 12 months" },
  { value: "over-1y", label: "Older than 1 year" },
  { value: "over-2y", label: "Older than 2 years" },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "frame", label: "Frame number" },
  { value: "built-desc", label: "Newest built" },
  { value: "built-asc", label: "Oldest built" },
];

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
  const ownerFilter = sp.owner && sp.owner !== "all" ? sp.owner : null;
  const templateFilter = sp.template && sp.template !== "all" ? sp.template : null;
  const builtFilter =
    sp.built && BUILT_PRESETS.some((p) => p.value === sp.built)
      ? sp.built
      : null;
  const fleetFilter = sp.fleet === "1";
  const sortFilter =
    sp.sort && SORT_OPTIONS.some((s) => s.value === sp.sort)
      ? sp.sort
      : "frame";

  const supabase = await createClient();

  // Built-date preset → built_at bounds. "Older than" uses a strict upper bound,
  // which also drops NULL built_at (not-yet-built bikes), as intended.
  const now = new Date();
  let builtGte: string | null = null;
  let builtLt: string | null = null;
  if (builtFilter === "this-year") {
    builtGte = `${now.getFullYear()}-01-01`;
  } else if (builtFilter === "last-12m") {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    builtGte = d.toISOString();
  } else if (builtFilter === "over-1y") {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    builtLt = d.toISOString();
  } else if (builtFilter === "over-2y") {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 2);
    builtLt = d.toISOString();
  }

  // Maintenance fleet = bikes whose owner has an active service agreement.
  // PostgREST can't join the agreement onto the bike's owner, so resolve the
  // org ids first (same shape as the has-part pre-resolution below).
  let fleetOrgIds: string[] | null = null;
  if (fleetFilter) {
    const { data: ag } = await supabase
      .from("service_agreements")
      .select("organization_id")
      .eq("status", "active");
    fleetOrgIds = Array.from(
      new Set((ag ?? []).map((a) => a.organization_id).filter(Boolean)),
    );
    if (fleetOrgIds.length === 0)
      fleetOrgIds = ["00000000-0000-0000-0000-000000000000"];
  }

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
        built_at,
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
    .is("deleted_at", null);

  if (statusFilter) bikesQuery = bikesQuery.eq("status", statusFilter);
  if (typeFilter) bikesQuery = bikesQuery.eq("bike_type_id", typeFilter);
  if (ownerFilter) bikesQuery = bikesQuery.eq("owner_organization_id", ownerFilter);
  if (templateFilter) bikesQuery = bikesQuery.eq("template_id", templateFilter);
  if (fleetOrgIds) bikesQuery = bikesQuery.in("owner_organization_id", fleetOrgIds);
  if (builtGte) bikesQuery = bikesQuery.gte("built_at", builtGte);
  if (builtLt) bikesQuery = bikesQuery.lt("built_at", builtLt);
  if (bikeIdsForPart) bikesQuery = bikesQuery.in("id", bikeIdsForPart);
  if (q) {
    bikesQuery = bikesQuery.ilike("frame_number", `%${q}%`);
  }

  // Sort: newest/oldest built (nulls last), else by frame number.
  if (sortFilter === "built-desc") {
    bikesQuery = bikesQuery
      .order("built_at", { ascending: false, nullsFirst: false })
      .order("frame_number", { ascending: true });
  } else if (sortFilter === "built-asc") {
    bikesQuery = bikesQuery
      .order("built_at", { ascending: true, nullsFirst: false })
      .order("frame_number", { ascending: true });
  } else {
    bikesQuery = bikesQuery.order("frame_number", { ascending: true });
  }

  // Facet sources for the Customer + Template pickers: only orgs/templates that
  // actually own/back a bike, so the dropdowns stay short and relevant.
  const facetQuery = supabase
    .from("bikes")
    .select("owner_organization_id, template_id")
    .is("deleted_at", null);

  const [bikesRes, typesRes, facetRes] = await Promise.all([
    bikesQuery,
    supabase
      .from("bike_types")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    facetQuery,
  ]);

  const ownerIds = Array.from(
    new Set(
      (facetRes.data ?? [])
        .map((r) => r.owner_organization_id)
        .filter((x): x is string => !!x),
    ),
  );
  const templateIds = Array.from(
    new Set(
      (facetRes.data ?? [])
        .map((r) => r.template_id)
        .filter((x): x is string => !!x),
    ),
  );

  const [ownerOptsRes, templateOptsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, legal_name, display_name_en, display_name_da")
      .in("id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("bike_templates")
      .select("id, name_en, family, frame_size, version")
      .in("id", templateIds.length ? templateIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const ownerOptions = (ownerOptsRes.data ?? [])
    .map((o) => ({
      id: o.id,
      label: o.display_name_da ?? o.display_name_en ?? o.legal_name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const templateOptions = (templateOptsRes.data ?? [])
    .map((t) => ({
      id: t.id,
      label: `${[t.family, t.frame_size, t.name_en].filter(Boolean).join(" · ")} (v${t.version})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (bikesRes.error) {
    throw new Error(`Failed to load bikes: ${bikesRes.error.message}`);
  }

  const rows = bikesRes.data ?? [];
  const totalCount = bikesRes.count ?? rows.length;

  // Active-filter chips, each removable (link to the same URL minus that param).
  function hrefWithout(key: string): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === key) continue;
      if (typeof v === "string" && v) p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `/bikes?${qs}` : "/bikes";
  }

  const activeChips: { key: string; label: string }[] = [];
  if (q) activeChips.push({ key: "q", label: `Frame: ${q}` });
  if (statusFilter)
    activeChips.push({ key: "status", label: bikeStatusLabel(statusFilter) });
  if (typeFilter) {
    const t = typesRes.data?.find((x) => x.id === typeFilter);
    if (t) activeChips.push({ key: "type", label: t.name_en });
  }
  if (ownerFilter) {
    const o = ownerOptions.find((x) => x.id === ownerFilter);
    activeChips.push({ key: "owner", label: o ? o.label : "Customer" });
  }
  if (templateFilter) {
    const t = templateOptions.find((x) => x.id === templateFilter);
    activeChips.push({ key: "template", label: t ? t.label : "Template" });
  }
  if (builtFilter) {
    const b = BUILT_PRESETS.find((x) => x.value === builtFilter);
    if (b) activeChips.push({ key: "built", label: b.label });
  }
  if (fleetFilter)
    activeChips.push({ key: "fleet", label: "Maintenance fleet" });
  if (hasPartName)
    activeChips.push({ key: "has-part", label: `Has ${hasPartName}` });

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
              {activeChips.length > 0
                ? ` · ${activeChips.length} filter${activeChips.length === 1 ? "" : "s"} active`
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
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
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
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="bikes-owner">
            Customer
          </label>
          <select
            id="bikes-owner"
            name="owner"
            defaultValue={ownerFilter ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              ownerFilter && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">All customers</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="bikes-template">
            Template
          </label>
          <select
            id="bikes-template"
            name="template"
            defaultValue={templateFilter ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              templateFilter && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">All templates</option>
            {templateOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="bikes-built">
            Built
          </label>
          <select
            id="bikes-built"
            name="built"
            defaultValue={builtFilter ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              builtFilter && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">Any build date</option>
            {BUILT_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="bikes-sort">
            Sort by
          </label>
          <select
            id="bikes-sort"
            name="sort"
            defaultValue={sortFilter}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Preserve a part filter arrived-at from a part page across Apply. */}
        {hasPartId ? (
          <input type="hidden" name="has-part" value={hasPartId} />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-3">
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 text-sm",
              fleetFilter && "font-medium",
            )}
          >
            <input
              type="checkbox"
              name="fleet"
              value="1"
              defaultChecked={fleetFilter}
              className="size-4"
            />
            Maintenance fleet (owner has an active service agreement)
          </label>
          <div className="flex items-center gap-2">
            {activeChips.length > 0 ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/bikes">Clear all</Link>
              </Button>
            ) : null}
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
          </div>
        </div>
      </form>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((c) => (
            <Link
              key={c.key}
              href={hrefWithout(c.key)}
              className="bg-muted hover:bg-muted/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
            >
              {c.label}
              <span aria-hidden className="text-muted-foreground">
                ✕
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        activeChips.length > 0 ? (
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
                <TableHead className="hidden xl:table-cell">Built</TableHead>
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
                            ralCode={b.color.ral_code}
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
                  <TableCell className="hidden p-0 text-sm xl:table-cell">
                    <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                      {b.built_at ? (
                        formatDate(b.built_at)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
