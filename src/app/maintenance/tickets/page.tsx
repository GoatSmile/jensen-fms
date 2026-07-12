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
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import {
  OPEN_TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_VARIANT,
  ticketPriorityVariant,
  type TicketPriority,
  type TicketSource,
  type TicketStatus,
} from "@/lib/maintenance/ticket-status";
import { cn } from "@/lib/utils";

/** Inset 3px left stripe used to flag urgent open tickets in the list. */
const URGENT_BORDER = "shadow-[inset_3px_0_0_var(--destructive)]";

type SearchParams = {
  status?: string;
  priority?: string;
  source?: string;
};

const STATUS_KEYS = Object.keys(TICKET_STATUS_LABEL) as TicketStatus[];

function parseStatusFilter(v: string | undefined): TicketStatus | "all" {
  if (!v || v === "all") return "all";
  return STATUS_KEYS.includes(v as TicketStatus) ? (v as TicketStatus) : "all";
}

function parsePriorityFilter(v: string | undefined): TicketPriority | "all" {
  if (!v || v === "all") return "all";
  const n = Number(v);
  return TICKET_PRIORITIES.includes(n as TicketPriority)
    ? (n as TicketPriority)
    : "all";
}

function parseSourceFilter(v: string | undefined): TicketSource | "all" {
  if (!v || v === "all") return "all";
  return TICKET_SOURCES.includes(v as TicketSource)
    ? (v as TicketSource)
    : "all";
}

export default async function MaintenanceTicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const statusFilter = parseStatusFilter(sp.status);
  const priorityFilter = parsePriorityFilter(sp.priority);
  const sourceFilter = parseSourceFilter(sp.source);

  const supabase = await createClient();
  let query = supabase
    .from("maintenance_tickets")
    .select(
      `
        id, ticket_number, status, priority, source, reported_at,
        description,
        bike:bikes!bike_id(
          id, frame_number,
          bike_template:bike_templates(family:bike_families(name), frame_size, name_en),
          owner_organization:organizations!owner_organization_id(id, legal_name, display_name_da, display_name_en)
        )
      `,
    )
    .order("reported_at", { ascending: false });

  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (priorityFilter !== "all") query = query.eq("priority", priorityFilter);
  if (sourceFilter !== "all") query = query.eq("source", sourceFilter);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load tickets: ${error.message}`);
  }

  const rows = data ?? [];
  const filtersActive =
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    sourceFilter !== "all";

  const [t, tCommon, tStatus, tPriority] = await Promise.all([
    getTranslations("tickets"),
    getTranslations("common"),
    getTranslations("ticketStatus"),
    getTranslations("ticketPriority"),
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
            <Link href="/maintenance/tickets/new">
              <Plus aria-hidden /> {t("newTicket")}
            </Link>
          </Button>
        </div>

        <FilterBar
          status={statusFilter}
          priority={priorityFilter}
          source={sourceFilter}
        />
      </header>

      {rows.length === 0 ? (
        filtersActive ? (
          <EmptyState
            icon={Wrench}
            title={t("emptyFilteredTitle")}
            description={t("emptyFilteredDesc")}
            secondaryAction={{ label: t("clearFilters"), href: "/maintenance/tickets" }}
          />
        ) : (
          <EmptyState
            icon={Wrench}
            title={t("emptyTitle")}
            description={t("emptyDesc")}
            action={{ label: t("newTicket"), href: "/maintenance/tickets/new" }}
          />
        )
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[180px]">
                  {t("thTicket")}
                </TableHead>
                <TableHead>{t("thBike")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("thCustomer")}
                </TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thPriority")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thReported")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((ticket) => {
                const bike = ticket.bike;
                const templateLabel = bike?.bike_template
                  ? [
                      bike.bike_template.family?.name,
                      bike.bike_template.frame_size,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : null;
                const ownerName =
                  bike?.owner_organization?.display_name_da ??
                  bike?.owner_organization?.display_name_en ??
                  bike?.owner_organization?.legal_name ??
                  null;
                const isUrgentOpen =
                  ticket.priority === 1 &&
                  OPEN_TICKET_STATUSES.includes(ticket.status as TicketStatus);
                const href = `/maintenance/tickets/${ticket.id}`;
                return (
                  <TableRow
                    key={ticket.id}
                    className={cn(
                      "hover:bg-muted/50 cursor-pointer",
                      isUrgentOpen && URGENT_BORDER,
                    )}
                  >
                    <TableCell className="p-0 text-xs">
                      <Link href={href} className="block px-4 py-2.5">
                        <SegmentedId value={ticket.ticket_number} />
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        {bike ? (
                          <>
                            <SegmentedId
                              value={bike.frame_number}
                              className="text-xs"
                            />
                            {templateLabel ? (
                              <div className="text-muted-foreground text-xs">
                                {templateLabel}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          // Customer report via /report/help — no bike id
                          // yet; staff triages from here.
                          <div className="text-amber-700 dark:text-amber-400 text-xs italic">
                            {t("needsTriage")}
                          </div>
                        )}
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
                            TICKET_STATUS_VARIANT[ticket.status as TicketStatus] ??
                            "outline"
                          }
                        >
                          {tStatus(ticket.status)}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        <Badge variant={ticketPriorityVariant(ticket.priority)}>
                          {tPriority(String(ticket.priority))}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {formatDate(ticket.reported_at)}
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
  priority,
  source,
}: {
  status: TicketStatus | "all";
  priority: TicketPriority | "all";
  source: TicketSource | "all";
}) {
  const [t, tStatus, tPriority, tSource] = await Promise.all([
    getTranslations("tickets"),
    getTranslations("ticketStatus"),
    getTranslations("ticketPriority"),
    getTranslations("ticketSource"),
  ]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <FilterGroup label={t("filterStatus")}>
        <FilterChip
          href={buildHref({ status: undefined, priority, source })}
          active={status === "all"}
          label={t("filterAll")}
        />
        {STATUS_KEYS.map((s) => (
          <FilterChip
            key={s}
            href={buildHref({ status: s, priority, source })}
            active={status === s}
            label={tStatus(s)}
          />
        ))}
      </FilterGroup>
      <FilterGroup label={t("filterPriority")}>
        <FilterChip
          href={buildHref({ status, priority: undefined, source })}
          active={priority === "all"}
          label={t("filterAll")}
        />
        {TICKET_PRIORITIES.map((p) => (
          <FilterChip
            key={p}
            href={buildHref({ status, priority: p, source })}
            active={priority === p}
            label={tPriority(String(p))}
          />
        ))}
      </FilterGroup>
      <FilterGroup label={t("filterSource")}>
        <FilterChip
          href={buildHref({ status, priority, source: undefined })}
          active={source === "all"}
          label={t("filterAll")}
        />
        {TICKET_SOURCES.map((s) => (
          <FilterChip
            key={s}
            href={buildHref({ status, priority, source: s })}
            active={source === s}
            label={tSource(s)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}

function buildHref({
  status,
  priority,
  source,
}: {
  status?: TicketStatus | "all";
  priority?: TicketPriority | "all";
  source?: TicketSource | "all";
}): string {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (priority && priority !== "all") params.set("priority", String(priority));
  if (source && source !== "all") params.set("source", source);
  const qs = params.toString();
  return qs ? `/maintenance/tickets?${qs}` : "/maintenance/tickets";
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
