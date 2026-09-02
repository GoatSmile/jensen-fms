import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
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
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/ui/panel";
import { ColorChip } from "@/components/color-swatch";
import { EmptyState } from "@/components/empty-state";
import { SegmentedId } from "@/components/segmented-id";
import { SortableHeader } from "@/components/sortable-header";
import { createClient } from "@/lib/supabase/server";
import { localizedName } from "@/i18n/vocab";
import { formatDate } from "@/lib/parts/format";
import { formatDeliveryTarget } from "@/lib/iso-week";
import {
  MO_STATUS_VARIANT,
  OPEN_MO_STATUSES,
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

/**
 * `?sort=` whitelist. Half of these are labels assembled from embeds — the
 * template's family + size + name, a localized colour, the customer behind the
 * sales order — so the ordering happens in memory rather than in Postgres.
 * Fine while an MO list is tens of rows; if it ever pages, this moves into a
 * view the way the parts list orders DB-side.
 */
const SORTABLE_COLUMNS = [
  "mo_number",
  "created_at",
  "client",
  "template",
  "type",
  "colour",
  "target",
  "status",
  "planned",
] as const;

type SortColumn = (typeof SORTABLE_COLUMNS)[number];

/** Default: newest MO on top — the list is read as "what did we just start". */
function parseSort(value: string | undefined): {
  column: SortColumn;
  ascending: boolean;
} {
  if (!value) return { column: "created_at", ascending: false };
  const [colRaw, dirRaw] = value.split(":");
  const column = (SORTABLE_COLUMNS as readonly string[]).includes(colRaw)
    ? (colRaw as SortColumn)
    : "created_at";
  return { column, ascending: dirRaw !== "desc" };
}

export default async function ManufacturingOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const sp = await searchParams;
  const { column: sortColumn, ascending: sortAscending } = parseSort(sp.sort);
  const [t, tCommon, tStatus, locale] = await Promise.all([
    getTranslations("mo"),
    getTranslations("common"),
    getTranslations("moStatus"),
    getLocale(),
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("manufacturing_orders")
    .select(
      `
        id, mo_number, status, target_quantity, completed_quantity, created_at,
        planned_start_date, planned_completion_date, planned_completion_precision, notes,
        bike_type:bike_types(id, name_en, name_da),
        bike_template:bike_templates(id, name_en, family:bike_families(name), frame_size, version),
        color:colors(id, name_en, name_da, hex),
        sales_order:sales_orders!sales_order_id(
          id, sales_order_number,
          organization:organizations!organization_id(id, legal_name, display_name_en, display_name_da)
        )
      `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load manufacturing orders: ${error.message}`);
  }

  const today = todayISODate();

  // One place where each row's DISPLAY label is decided, so the comparator and
  // the cell can never disagree about what "sorted by client" means.
  const rows = (data ?? [])
    .map((mo) => ({
      mo,
      tplLabel: mo.bike_template
        ? [
            mo.bike_template.family?.name,
            mo.bike_template.frame_size,
            mo.bike_template.name_en,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
      typeLabel: mo.bike_type
        ? localizedName(locale, mo.bike_type.name_en, mo.bike_type.name_da)
        : null,
      colourLabel: mo.color
        ? localizedName(locale, mo.color.name_en, mo.color.name_da)
        : null,
      // Same expression as the sales-order list, so the two agree on a name.
      client:
        mo.sales_order?.organization?.display_name_da ??
        mo.sales_order?.organization?.display_name_en ??
        mo.sales_order?.organization?.legal_name ??
        null,
      // What the Planned column actually shows the far end of.
      plannedSort: mo.planned_completion_date ?? mo.planned_start_date ?? null,
    }))
    .sort((a, b) => {
      // Pick the key this column sorts on, then compare once. Splitting key
      // choice from comparison is what lets nulls stay last in BOTH
      // directions: negating a comparator would float empty cells to the top.
      const keyed: Record<
        SortColumn,
        { a: string | number | null; b: string | number | null; numeric?: true }
      > = {
        mo_number: { a: a.mo.mo_number, b: b.mo.mo_number },
        created_at: { a: a.mo.created_at, b: b.mo.created_at },
        client: { a: a.client, b: b.client },
        template: { a: a.tplLabel, b: b.tplLabel },
        type: { a: a.typeLabel, b: b.typeLabel },
        colour: { a: a.colourLabel, b: b.colourLabel },
        target: {
          a: a.mo.target_quantity,
          b: b.mo.target_quantity,
          numeric: true,
        },
        status: { a: a.mo.status, b: b.mo.status },
        planned: { a: a.plannedSort, b: b.plannedSort },
      };
      const { a: av, b: bv, numeric } = keyed[sortColumn];
      if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
      if (av != null && bv != null) {
        const cmp = numeric
          ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv), locale);
        if (cmp !== 0) return sortAscending ? cmp : -cmp;
      }
      // Ties always read newest first — the MO number is chronological.
      return b.mo.mo_number.localeCompare(a.mo.mo_number, locale);
    });

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
            </p>
          </div>
          <Button asChild>
            <Link href="/manufacturing-orders/new">
              <Plus aria-hidden /> {t("newMo")}
            </Link>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
          action={{ label: t("newMo"), href: "/manufacturing-orders/new" }}
        />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader
                  column="mo_number"
                  label={t("thNumber")}
                  className="w-[140px] sm:w-[180px]"
                />
                <SortableHeader
                  column="created_at"
                  label={t("thDate")}
                  firstDirection="desc"
                  className="hidden sm:table-cell"
                />
                <SortableHeader
                  column="client"
                  label={t("thClient")}
                  className="hidden md:table-cell"
                />
                <SortableHeader
                  column="template"
                  label={t("thTemplate")}
                  className="hidden md:table-cell"
                />
                <SortableHeader
                  column="type"
                  label={t("thType")}
                  className="hidden lg:table-cell"
                />
                <SortableHeader
                  column="colour"
                  label={t("thColour")}
                  className="hidden lg:table-cell"
                />
                <SortableHeader
                  column="target"
                  label={t("thTargetDone")}
                  align="right"
                  firstDirection="desc"
                  className="hidden text-right md:table-cell"
                />
                <SortableHeader column="status" label={t("thStatus")} />
                <SortableHeader
                  column="planned"
                  label={t("thPlanned")}
                  className="hidden lg:table-cell"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ mo, tplLabel, typeLabel, colourLabel, client }) => {
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
                    <TableCell className="text-muted-foreground hidden p-0 text-xs whitespace-nowrap sm:table-cell">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {formatDate(mo.created_at)}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-sm md:table-cell">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {client ?? (
                          <span className="text-muted-foreground italic">
                            {t("stockBuild")}
                          </span>
                        )}
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
                            {t("oneOff")}
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
                          {typeLabel ?? "—"}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-sm lg:table-cell">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {mo.color && colourLabel ? (
                          <ColorChip hex={mo.color.hex} label={colourLabel} />
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
                          {tStatus.has(mo.status)
                            ? tStatus(mo.status)
                            : mo.status}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden p-0 text-xs lg:table-cell">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5"
                      >
                        {formatDate(mo.planned_start_date)}
                        {mo.planned_completion_date ? (
                          <>
                            {" "}
                            –{" "}
                            {formatDeliveryTarget(
                              mo.planned_completion_date,
                              mo.planned_completion_precision,
                            )}
                          </>
                        ) : null}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
