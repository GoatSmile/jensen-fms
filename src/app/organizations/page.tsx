import Link from "next/link";
import { Building2, Plus } from "lucide-react";

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
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  q?: string;
  segment?: string;
};

function formatDateDa(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const segmentSlug = sp.segment?.trim() ?? "";

  const supabase = await createClient();

  const [segmentsRes] = await Promise.all([
    supabase
      .from("customer_segments")
      .select("id, slug, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const segments = segmentsRes.data ?? [];
  const selectedSegment = segmentSlug
    ? segments.find((s) => s.slug === segmentSlug) ?? null
    : null;

  let orgsQuery = supabase
    .from("organizations")
    .select(
      `
        id, legal_name, display_name_en, display_name_da,
        email, phone, country_code, created_at,
        segment:customer_segments(id, slug, name_en)
      `,
      { count: "exact" },
    )
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("legal_name", { ascending: true });

  if (selectedSegment) {
    orgsQuery = orgsQuery.eq("customer_segment_id", selectedSegment.id);
  }
  if (q) {
    // Escape % and , so a user-typed comma in the search box can't break the
    // ilike-or expression. Commas would otherwise terminate one of the args.
    const safe = q.replace(/[\\%,]/g, (m) => `\\${m}`);
    orgsQuery = orgsQuery.or(
      `legal_name.ilike.%${safe}%,display_name_en.ilike.%${safe}%,display_name_da.ilike.%${safe}%`,
    );
  }

  const orgsRes = await orgsQuery;
  if (orgsRes.error) {
    throw new Error(`Failed to load customers: ${orgsRes.error.message}`);
  }
  const rows = orgsRes.data ?? [];
  const totalCount = orgsRes.count ?? rows.length;

  // Bike counts per org. Pulled separately so we can keep the bikes filter
  // (`deleted_at IS NULL`) clean. Fine at small scale; bucket into the SQL
  // view if it ever lags.
  const bikeCountByOrg = new Map<string, number>();
  if (rows.length > 0) {
    const { data: bikeRows } = await supabase
      .from("bikes")
      .select("owner_organization_id")
      .in(
        "owner_organization_id",
        rows.map((r) => r.id),
      )
      .is("deleted_at", null);
    for (const r of bikeRows ?? []) {
      if (!r.owner_organization_id) continue;
      bikeCountByOrg.set(
        r.owner_organization_id,
        (bikeCountByOrg.get(r.owner_organization_id) ?? 0) + 1,
      );
    }
  }

  const filterDescriptors: string[] = [];
  if (selectedSegment) filterDescriptors.push(selectedSegment.name_en.toLowerCase());
  if (q) filterDescriptors.push(`matching "${q}"`);

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
              <BreadcrumbPage>Customers</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
            <p className="text-muted-foreground text-sm">
              {totalCount} {totalCount === 1 ? "customer" : "customers"}
              {filterDescriptors.length > 0
                ? ` · ${filterDescriptors.join(" · ")}`
                : ""}
            </p>
          </div>
          <Button asChild>
            <Link href="/organizations/new">
              <Plus aria-hidden /> Add customer
            </Link>
          </Button>
        </div>
      </header>

      <form method="get" className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="org-q">
            Search
          </label>
          <Input
            id="org-q"
            name="q"
            defaultValue={q}
            placeholder="Legal name or display name…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="org-segment">
            Segment
          </label>
          <select
            id="org-segment"
            name="segment"
            defaultValue={segmentSlug}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">All segments</option>
            {segments.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name_en}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end justify-end sm:col-span-2">
          <Button type="submit" size="sm" variant="outline">
            Apply
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        filterDescriptors.length > 0 ? (
          <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
            No customers match these filters.
          </div>
        ) : (
          <EmptyState
            icon={Building2}
            title="No customers yet"
            description="Add your first customer to start assigning bikes and tracking service."
            action={{ label: "Add customer", href: "/organizations/new" }}
          />
        )
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead className="hidden md:table-cell">Country</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Bikes
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const display = o.display_name_en ?? o.display_name_da;
                const subtitle =
                  display && display !== o.legal_name ? display : null;
                const contact = o.email || o.phone || null;
                const bikeCount = bikeCountByOrg.get(o.id) ?? 0;
                return (
                  <TableRow
                    key={o.id}
                    className="hover:bg-muted/50 cursor-pointer"
                  >
                    <TableCell className="p-0">
                      <Link
                        href={`/organizations/${o.id}`}
                        className="block px-4 py-2.5"
                      >
                        <div className="font-medium">{o.legal_name}</div>
                        {subtitle ? (
                          <div className="text-muted-foreground text-xs">
                            {subtitle}
                          </div>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link
                        href={`/organizations/${o.id}`}
                        className="block px-4 py-2.5"
                      >
                        <Badge variant="outline" className="font-normal">
                          {o.segment?.name_en ?? "—"}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 sm:table-cell">
                      <Link
                        href={`/organizations/${o.id}`}
                        className="block px-4 py-2.5 text-sm"
                      >
                        {contact ? (
                          <span
                            className={
                              o.email
                                ? "font-mono text-xs"
                                : "tabular-nums"
                            }
                          >
                            {contact}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 md:table-cell">
                      <Link
                        href={`/organizations/${o.id}`}
                        className="block px-4 py-2.5 font-mono text-xs"
                      >
                        {o.country_code ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right md:table-cell">
                      <Link
                        href={`/organizations/${o.id}`}
                        className="block px-4 py-2.5 text-sm tabular-nums"
                      >
                        {bikeCount}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right lg:table-cell">
                      <Link
                        href={`/organizations/${o.id}`}
                        className="block px-4 py-2.5 text-xs"
                      >
                        <span className="text-muted-foreground">
                          {formatDateDa(o.created_at)}
                        </span>
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
