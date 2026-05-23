import Link from "next/link";
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
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import {
  OPEN_TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_VARIANT,
  ticketPriorityLabel,
  ticketPriorityVariant,
  ticketSourceLabel,
  ticketStatusLabel,
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
          bike_template:bike_templates(family, frame_size, name_en),
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
              <BreadcrumbPage>Maintenance</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
            <p className="text-muted-foreground text-sm">
              {rows.length} {rows.length === 1 ? "ticket" : "tickets"}
              {filtersActive ? " match these filters" : ""}
            </p>
          </div>
          <Button asChild>
            <Link href="/maintenance/tickets/new">
              <Plus aria-hidden /> New ticket
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
            title="No tickets match these filters"
            description="Try clearing one of the filter chips above."
            secondaryAction={{ label: "Clear filters", href: "/maintenance/tickets" }}
          />
        ) : (
          <EmptyState
            icon={Wrench}
            title="No tickets yet"
            description="When a customer reports an issue with a bike, log it here so it doesn't get lost between sticky notes."
            action={{ label: "New ticket", href: "/maintenance/tickets/new" }}
          />
        )
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[180px]">
                  Ticket
                </TableHead>
                <TableHead>Bike</TableHead>
                <TableHead className="hidden lg:table-cell">Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Priority</TableHead>
                <TableHead className="hidden md:table-cell">Reported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => {
                const bike = t.bike;
                const templateLabel = bike?.bike_template
                  ? [
                      bike.bike_template.family,
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
                  t.priority === 1 &&
                  OPEN_TICKET_STATUSES.includes(t.status as TicketStatus);
                const href = `/maintenance/tickets/${t.id}`;
                return (
                  <TableRow
                    key={t.id}
                    className={cn(
                      "hover:bg-muted/50 cursor-pointer",
                      isUrgentOpen && URGENT_BORDER,
                    )}
                  >
                    <TableCell className="p-0 font-mono text-xs">
                      <Link href={href} className="block px-4 py-2.5">
                        {t.ticket_number}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        {bike ? (
                          <>
                            <div className="font-mono text-xs">
                              {bike.frame_number}
                            </div>
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
                            Needs triage — no bike specified
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
                            No owner
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        <Badge
                          variant={
                            TICKET_STATUS_VARIANT[t.status as TicketStatus] ??
                            "outline"
                          }
                        >
                          {ticketStatusLabel(t.status)}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        <Badge variant={ticketPriorityVariant(t.priority)}>
                          {ticketPriorityLabel(t.priority)}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {formatDate(t.reported_at)}
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

function FilterBar({
  status,
  priority,
  source,
}: {
  status: TicketStatus | "all";
  priority: TicketPriority | "all";
  source: TicketSource | "all";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <FilterGroup label="Status">
        <FilterChip
          href={buildHref({ status: undefined, priority, source })}
          active={status === "all"}
          label="All"
        />
        {STATUS_KEYS.map((s) => (
          <FilterChip
            key={s}
            href={buildHref({ status: s, priority, source })}
            active={status === s}
            label={ticketStatusLabel(s)}
          />
        ))}
      </FilterGroup>
      <FilterGroup label="Priority">
        <FilterChip
          href={buildHref({ status, priority: undefined, source })}
          active={priority === "all"}
          label="All"
        />
        {TICKET_PRIORITIES.map((p) => (
          <FilterChip
            key={p}
            href={buildHref({ status, priority: p, source })}
            active={priority === p}
            label={ticketPriorityLabel(p)}
          />
        ))}
      </FilterGroup>
      <FilterGroup label="Source">
        <FilterChip
          href={buildHref({ status, priority, source: undefined })}
          active={source === "all"}
          label="All"
        />
        {TICKET_SOURCES.map((s) => (
          <FilterChip
            key={s}
            href={buildHref({ status, priority, source: s })}
            active={source === s}
            label={ticketSourceLabel(s)}
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
          ? "bg-foreground text-background border-foreground"
          : "hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
}
