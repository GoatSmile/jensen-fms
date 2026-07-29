import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import { localizedName } from "@/i18n/vocab";
import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/parts/format";

import { Panel } from "@/components/ui/panel";

import { MakeDefaultButton } from "./_components/make-default-button";

type PriceListRow = {
  id: string;
  name: string;
  currency: string;
  effective_from: string | null;
  version: number;
  is_current: boolean;
  created_at: string;
  supplier_id: string;
  service_type_id: string;
  supplierName: string;
  serviceTypeName: string;
  items: {
    service_part_type_id: string;
    supplier_item_no: string | null;
    tier_min: number;
    tier_max: number | null;
    unit_price: number;
  }[];
};

function tierKey(min: number, max: number | null): string {
  return `${min}:${max ?? "open"}`;
}

function tierHeading(min: number, max: number | null): string {
  return max == null ? `${min}+` : `${min}–${max}`;
}

/**
 * Service price lists — per supplier × service type, the CURRENT revision
 * as a part-type × qty-tier grid, with the revision history under it. A
 * price change is never edit-in-place: "New revision" duplicates the
 * current grid into the editor, shows a diff, and publishes with an
 * is_current flip (the bike_templates versioning pattern). Sent service
 * orders keep their frozen snapshots regardless.
 */
export default async function AdminServicesPage() {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("adminServices"),
    getTranslations("common"),
    getLocale(),
  ]);
  const supabase = await createClient();

  // No suppliers query any more: the default is set from a price-list panel, so
  // the only candidates are the suppliers that already appear as one.
  const [listsRes, partTypesRes, serviceTypesRes] =
    await Promise.all([
    supabase
      .from("service_price_lists")
      .select(
        `
          id, name, currency, effective_from, version, is_current, created_at,
          supplier_id, service_type_id,
          supplier:suppliers(name),
          service_type:service_types(name_en, name_da),
          items:service_price_items(
            service_part_type_id, supplier_item_no, tier_min, tier_max, unit_price
          )
        `,
      )
      .order("version", { ascending: false }),
    supabase
      .from("service_part_types")
      .select("id, name_en, name_da, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("service_types")
      .select("id, name_en, name_da, default_supplier_id, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const serviceTypeRows = (serviceTypesRes.data ?? []).map((st) => ({
    id: st.id,
    name: localizedName(locale, st.name_en, st.name_da),
    defaultSupplierId: st.default_supplier_id,
  }));
  // Which supplier is default per type, for the badge-vs-button decision.
  const defaultSupplierByType = new Map(
    serviceTypeRows.map((st) => [st.id, st.defaultSupplierId]),
  );
  // Names for defaults that may not appear as a price-list group at all — needed
  // to say WHICH painter is missing prices.
  const defaultSupplierIds = serviceTypeRows
    .map((st) => st.defaultSupplierId)
    .filter((id): id is string => Boolean(id));
  const defaultSupplierNames = new Map<string, string>();
  if (defaultSupplierIds.length > 0) {
    const { data: defaultSuppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", defaultSupplierIds);
    for (const s of defaultSuppliers ?? []) {
      defaultSupplierNames.set(s.id, s.name);
    }
  }

  if (listsRes.error) {
    throw new Error(`Failed to load price lists: ${listsRes.error.message}`);
  }

  const partTypeName = new Map<string, string>();
  const partTypeSort = new Map<string, number>();
  for (const pt of partTypesRes.data ?? []) {
    partTypeName.set(pt.id, localizedName(locale, pt.name_en, pt.name_da));
    partTypeSort.set(pt.id, pt.sort_order);
  }

  const lists: PriceListRow[] = (listsRes.data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    currency: l.currency,
    effective_from: l.effective_from,
    version: l.version,
    is_current: l.is_current,
    created_at: l.created_at,
    supplier_id: l.supplier_id,
    service_type_id: l.service_type_id,
    supplierName: one(l.supplier)?.name ?? "—",
    serviceTypeName:
      localizedName(
        locale,
        one(l.service_type)?.name_en,
        one(l.service_type)?.name_da,
      ) || "—",
    items: (l.items ?? []).map((i) => ({
      service_part_type_id: i.service_part_type_id,
      supplier_item_no: i.supplier_item_no,
      tier_min: i.tier_min,
      tier_max: i.tier_max,
      unit_price: Number(i.unit_price),
    })),
  }));

  // Group revisions per supplier × service type; current first when present.
  const groups = new Map<string, PriceListRow[]>();
  for (const l of lists) {
    const key = `${l.supplier_id}:${l.service_type_id}`;
    const arr = groups.get(key) ?? [];
    arr.push(l);
    groups.set(key, arr);
  }
  const groupList = [...groups.values()].sort((a, b) => {
    const ga = a[0];
    const gb = b[0];
    return (
      ga.serviceTypeName.localeCompare(gb.serviceTypeName) ||
      ga.supplierName.localeCompare(gb.supplierName)
    );
  });

  // Service types whose default painter cannot price anything — either none is
  // set, or the one that is has no CURRENT list. Both make the template estimate
  // refuse, and the second is the state the old free-choice dropdown produced, so
  // it has to be visible HERE rather than only on a template page.
  const currentListKeys = new Set(
    lists
      .filter((l) => l.is_current)
      .map((l) => `${l.supplier_id}:${l.service_type_id}`),
  );
  const unpriceableTypes = serviceTypeRows
    .filter(
      (st) =>
        !st.defaultSupplierId ||
        !currentListKeys.has(`${st.defaultSupplierId}:${st.id}`),
    )
    .map((st) => ({
      name: st.name,
      supplierName: st.defaultSupplierId
        ? (defaultSupplierNames.get(st.defaultSupplierId) ?? null)
        : null,
    }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/admin/services/new">
            <Plus aria-hidden /> {t("newPriceList")}
          </Link>
        </Button>
      </div>

      {/* The "Default suppliers" select panel is gone (2026-07-29). It listed
          every active supplier, so it let you default to one with no price list —
          which broke the template estimate and made new orders unsendable, with
          nothing on screen saying so. Setting the default now happens on the
          price-list panel that proves prices exist. */}
      {unpriceableTypes.length > 0 ? (
        <Panel hue="money" title={t("noDefaultHeading")}>
          <ul className="text-ink-2 flex flex-col gap-1 text-sm">
            {unpriceableTypes.map((type) => (
              <li key={type.name}>
                {type.supplierName
                  ? t("defaultHasNoListBody", {
                      type: type.name,
                      supplier: type.supplierName,
                    })
                  : t("noDefaultBody", { type: type.name })}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {groupList.length === 0 ? (
        <div className="text-muted-foreground flex h-32 items-center justify-center rounded-md border border-dashed text-sm">
          {t("emptyState")}
        </div>
      ) : (
        groupList.map((revisions) => {
          const current = revisions.find((r) => r.is_current) ?? null;
          const head = revisions[0];

          // Grid columns = the current revision's distinct tier ranges.
          const tierCols: { min: number; max: number | null }[] = [];
          const seen = new Set<string>();
          for (const item of current?.items ?? []) {
            const key = tierKey(item.tier_min, item.tier_max);
            if (seen.has(key)) continue;
            seen.add(key);
            tierCols.push({ min: item.tier_min, max: item.tier_max });
          }
          tierCols.sort((a, b) => a.min - b.min);

          const rowPartTypeIds = [
            ...new Set(
              (current?.items ?? []).map((i) => i.service_part_type_id),
            ),
          ].sort(
            (a, b) =>
              (partTypeSort.get(a) ?? 0) - (partTypeSort.get(b) ?? 0) ||
              (partTypeName.get(a) ?? "").localeCompare(
                partTypeName.get(b) ?? "",
              ),
          );
          const itemByCell = new Map<
            string,
            { unit_price: number; supplier_item_no: string | null }
          >();
          for (const item of current?.items ?? []) {
            itemByCell.set(
              `${item.service_part_type_id}|${tierKey(item.tier_min, item.tier_max)}`,
              item,
            );
          }

          return (
            <section
              key={`${head.supplier_id}:${head.service_type_id}`}
              className="rounded-md border"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-sm font-semibold">
                    {head.serviceTypeName} · {head.supplierName}
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    {current ? (
                      <>
                        {t("currentRevision", {
                          name: current.name,
                          version: current.version,
                          currency: current.currency,
                        })}
                        {current.effective_from
                          ? t("effectiveSuffix", {
                              date: formatDate(current.effective_from),
                            })
                          : ""}
                      </>
                    ) : (
                      t("noCurrentRevision")
                    )}
                  </p>
                </div>
                {/* Default marker + setter. Only a group with a current revision
                    can become the default — that is what keeps the "default
                    supplier has no prices" state unreachable. */}
                {current && head.supplier_id ? (
                  defaultSupplierByType.get(head.service_type_id) ===
                  head.supplier_id ? (
                    <Badge variant="secondary">{t("defaultBadge")}</Badge>
                  ) : (
                    <MakeDefaultButton
                      serviceTypeId={head.service_type_id}
                      supplierId={head.supplier_id}
                    />
                  )
                ) : null}
                {current ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/admin/services/new?from=${current.id}`}>
                      <Plus aria-hidden /> {t("newRevision")}
                    </Link>
                  </Button>
                ) : null}
              </header>

              {current ? (
                <div className="overflow-x-auto p-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("partColumn")}</TableHead>
                        {tierCols.map((tier) => (
                          <TableHead
                            key={tierKey(tier.min, tier.max)}
                            className="text-right"
                          >
                            {t("tierPcs", {
                              tier: tierHeading(tier.min, tier.max),
                            })}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rowPartTypeIds.map((ptId) => (
                        <TableRow key={ptId}>
                          <TableCell className="font-medium">
                            {partTypeName.get(ptId) ?? "—"}
                          </TableCell>
                          {tierCols.map((t) => {
                            const item = itemByCell.get(
                              `${ptId}|${tierKey(t.min, t.max)}`,
                            );
                            return (
                              <TableCell
                                key={tierKey(t.min, t.max)}
                                className="text-right"
                              >
                                {item ? (
                                  <span className="flex flex-col items-end gap-0.5">
                                    <span className="tabular-nums">
                                      {formatPrice(
                                        item.unit_price,
                                        current.currency,
                                      )}
                                    </span>
                                    {item.supplier_item_no ? (
                                      <span className="text-muted-foreground font-mono text-xs">
                                        {item.supplier_item_no}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              <div className="border-t px-4 py-3">
                <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                  {t("revisionsHeading")}
                </h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {revisions.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="text-muted-foreground w-8 font-mono text-xs">
                        v{r.version}
                      </span>
                      <span>{r.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {r.currency}
                        {r.effective_from
                          ? t("effectiveSuffix", {
                              date: formatDate(r.effective_from),
                            })
                          : ""}
                        {t("priceCountSuffix", { count: r.items.length })}
                        {t("addedSuffix", { date: formatDate(r.created_at) })}
                      </span>
                      {r.is_current ? (
                        <Badge variant="success">{t("currentBadge")}</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
