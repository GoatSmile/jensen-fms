import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Wrench } from "lucide-react";

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
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import {
  WO_STATUS_LABEL,
  WO_STATUS_VARIANT,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";
import { cn } from "@/lib/utils";

type SearchParams = {
  status?: string;
  bike?: string;
  billable?: string;
};

type BillableFilter = "all" | "only-billable" | "only-covered";

const STATUS_KEYS = Object.keys(WO_STATUS_LABEL) as WorkOrderStatus[];

function parseStatusFilter(v: string | undefined): WorkOrderStatus | "all" {
  if (!v || v === "all") return "all";
  return STATUS_KEYS.includes(v as WorkOrderStatus)
    ? (v as WorkOrderStatus)
    : "all";
}

function parseBillableFilter(v: string | undefined): BillableFilter {
  if (v === "only-billable" || v === "only-covered") return v;
  return "all";
}

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const statusFilter = parseStatusFilter(sp.status);
  const billableFilter = parseBillableFilter(sp.billable);
  const bikeFilter = sp.bike?.trim() ?? "";

  const supabase = await createClient();
  let query = supabase
    .from("work_orders")
    .select(
      `
        id, wo_number, status, is_billable, started_at, completed_at, created_at,
        bike:bikes!bike_id(
          id, frame_number,
          bike_template:bike_templates(family:bike_families(name), frame_size),
          owner_organization:organizations!owner_organization_id(id, legal_name, display_name_da, display_name_en)
        )
      `,
    )
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (billableFilter === "only-billable") query = query.eq("is_billable", true);
  if (billableFilter === "only-covered") query = query.eq("is_billable", false);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load work orders: ${error.message}`);
  }

  // Frame-number filter is applied in-memory: the relation is nested and
  // PostgREST doesn't filter the parent on a child column without an inner-
  // join syntax that the typed client doesn't expose cleanly. Volume is tiny.
  let rows = data ?? [];
  if (bikeFilter !== "") {
    const needle = bikeFilter.toLowerCase();
    rows = rows.filter((r) =>
      (r.bike?.frame_number ?? "").toLowerCase().includes(needle),
    );
  }

  const filtersActive =
    statusFilter !== "all" || billableFilter !== "all" || bikeFilter !== "";

  const [t, tCommon, tMaint, tWoStatus] = await Promise.all([
    getTranslations("workOrders"),
    getTranslations("common"),
    getTranslations("maintenance"),
    getTranslations("woStatus"),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{tCommon("crumbDashboard")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/maintenance/tickets">{tMaint("crumb")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("title")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("count", { count: rows.length })}
              {filtersActive ? t("matchFilters") : ""}
            </p>
          </div>
          <Button asChild>
            <Link href="/maintenance/work-orders/new">
              <Plus aria-hidden /> {t("newWorkOrder")}
            </Link>
          </Button>
        </div>

        <FilterBar
          status={statusFilter}
          billable={billableFilter}
          bike={bikeFilter}
        />
      </header>

      {rows.length === 0 ? (
        filtersActive ? (
          <EmptyState
            icon={Wrench}
            title={t("emptyFilteredTitle")}
            description={t("emptyFilteredDesc")}
            secondaryAction={{
              label: t("clearFilters"),
              href: "/maintenance/work-orders",
            }}
          />
        ) : (
          <EmptyState
            icon={Wrench}
            title={t("emptyTitle")}
            description={t("emptyDesc")}
            action={{ label: t("newWorkOrder"), href: "/maintenance/work-orders/new" }}
          />
        )
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[180px]">
                  {t("thWorkOrder")}
                </TableHead>
                <TableHead>{t("thBike")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("thCustomer")}
                </TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead>{t("thBilling")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thStarted")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thCompleted")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((wo) => {
                const bike = wo.bike;
                const templateLabel = bike?.bike_template
                  ? [bike.bike_template.family?.name, bike.bike_template.frame_size]
                      .filter(Boolean)
                      .join(" · ")
                  : null;
                const ownerName =
                  bike?.owner_organization?.display_name_da ??
                  bike?.owner_organization?.display_name_en ??
                  bike?.owner_organization?.legal_name ??
                  null;
                const href = `/maintenance/work-orders/${wo.id}`;
                return (
                  <TableRow
                    key={wo.id}
                    className={cn("hover:bg-muted/50 cursor-pointer")}
                  >
                    <TableCell className="p-0 text-xs">
                      <Link href={href} className="block px-4 py-2.5">
                        <SegmentedId value={wo.wo_number} />
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        <SegmentedId
                          value={bike?.frame_number ?? "—"}
                          className="text-xs"
                        />
                        {templateLabel ? (
                          <div className="text-muted-foreground text-xs">
                            {templateLabel}
                          </div>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-sm lg:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {ownerName ? (
                          <span>{ownerName}</span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            {t("noOwner")}
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        <Badge
                          variant={
                            WO_STATUS_VARIANT[wo.status as WorkOrderStatus] ??
                            "outline"
                          }
                        >
                          {tWoStatus(wo.status)}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        {wo.is_billable ? (
                          <Badge variant="outline" className="font-normal">
                            {t("billable")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-normal">
                            {t("covered")}
                          </Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {formatDate(wo.started_at)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {formatDate(wo.completed_at)}
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

async function FilterBar({
  status,
  billable,
  bike,
}: {
  status: WorkOrderStatus | "all";
  billable: BillableFilter;
  bike: string;
}) {
  const [t, tWoStatus] = await Promise.all([
    getTranslations("workOrders"),
    getTranslations("woStatus"),
  ]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <FilterGroup label={t("filterStatus")}>
        <FilterChip
          href={buildHref({ status: undefined, billable, bike })}
          active={status === "all"}
          label={t("filterAll")}
        />
        {STATUS_KEYS.map((s) => (
          <FilterChip
            key={s}
            href={buildHref({ status: s, billable, bike })}
            active={status === s}
            label={tWoStatus(s)}
          />
        ))}
      </FilterGroup>
      <FilterGroup label={t("filterBilling")}>
        <FilterChip
          href={buildHref({ status, billable: "all", bike })}
          active={billable === "all"}
          label={t("filterAll")}
        />
        <FilterChip
          href={buildHref({ status, billable: "only-billable", bike })}
          active={billable === "only-billable"}
          label={t("billable")}
        />
        <FilterChip
          href={buildHref({ status, billable: "only-covered", bike })}
          active={billable === "only-covered"}
          label={t("covered")}
        />
      </FilterGroup>
      <BikeFilterForm
        status={status}
        billable={billable}
        bike={bike}
        frameLabel={t("filterFrame")}
        framePlaceholder={t("framePlaceholder")}
      />
    </div>
  );
}

function BikeFilterForm({
  status,
  billable,
  bike,
  frameLabel,
  framePlaceholder,
}: {
  status: WorkOrderStatus | "all";
  billable: BillableFilter;
  bike: string;
  frameLabel: string;
  framePlaceholder: string;
}) {
  return (
    <form
      action="/maintenance/work-orders"
      method="GET"
      className="flex items-center gap-1.5"
    >
      {status !== "all" ? (
        <input type="hidden" name="status" value={status} />
      ) : null}
      {billable !== "all" ? (
        <input type="hidden" name="billable" value={billable} />
      ) : null}
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {frameLabel}
      </span>
      <Input
        type="search"
        name="bike"
        defaultValue={bike}
        placeholder={framePlaceholder}
        className="h-7 w-[140px] font-mono text-xs"
      />
    </form>
  );
}

function buildHref({
  status,
  billable,
  bike,
}: {
  status?: WorkOrderStatus | "all";
  billable?: BillableFilter;
  bike?: string;
}): string {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (billable && billable !== "all") params.set("billable", billable);
  if (bike && bike !== "") params.set("bike", bike);
  const qs = params.toString();
  return qs ? `/maintenance/work-orders?${qs}` : "/maintenance/work-orders";
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
}
