import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Boxes, Coins, Plus, Printer, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/empty-state";
import { compareKits } from "@/lib/kits/colors";
import { localizedName } from "@/i18n/vocab";
import { createClient } from "@/lib/supabase/server";
import { descendantIds, type FlatCategory } from "@/lib/parts/categories";
import type { StockStatus } from "@/lib/parts/stock";

import { findPartsBelowReorderPoint } from "./_actions/draft-po-from-reorder";
import { PartsFilters } from "./_components/parts-filters";
import {
  PartsTable,
  type PartRow,
  type PartRowKit,
} from "./_components/parts-table";
import { PartsPagination } from "./_components/pagination";
import { ReorderBanner } from "./_components/reorder-banner";
import type { SortColumn } from "./_components/sortable-header";

const PAGE_SIZE = 40;

const SORTABLE_COLUMNS: ReadonlyArray<SortColumn> = [
  "internal_sku",
  "name_en",
  "category_name",
  "primary_supplier_name",
  "stock_on_hand",
  "default_retail_price",
];

type SearchParams = {
  q?: string;
  category?: string;
  supplier?: string;
  kit?: string;
  stock?: string;
  page?: string;
  sort?: string;
  gap?: string;
};

/** Data-housekeeping filters the dashboard drills into. */
const GAP_FILTERS = {
  origin: { titleKey: "gapOriginTitle", hintKey: "gapOriginHint" },
  hs: { titleKey: "gapHsTitle", hintKey: "gapHsHint" },
  "offer-price": {
    titleKey: "gapOfferPriceTitle",
    hintKey: "gapOfferPriceHint",
  },
} as const;

type GapFilter = keyof typeof GAP_FILTERS;

function parseGapFilter(value: string | undefined): GapFilter | null {
  return value && value in GAP_FILTERS ? (value as GapFilter) : null;
}

function escapeOrValue(raw: string): string {
  if (/[,()"]/.test(raw)) {
    return `"${raw.replace(/"/g, '\\"')}"`;
  }
  return raw;
}

function parseStockFilter(value: string | undefined): StockStatus | "all" {
  return value === "ok" || value === "low" || value === "out" ? value : "all";
}

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseSort(value: string | undefined): {
  column: SortColumn;
  ascending: boolean;
} {
  // Default: SKU ascending — matches the prior behaviour.
  if (!value) return { column: "internal_sku", ascending: true };
  const [colRaw, dirRaw] = value.split(":");
  const column = (SORTABLE_COLUMNS as readonly string[]).includes(colRaw)
    ? (colRaw as SortColumn)
    : "internal_sku";
  const ascending = dirRaw !== "desc";
  return { column, ascending };
}

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const categoryId = sp.category && sp.category !== "all" ? sp.category : null;
  const supplierId = sp.supplier && sp.supplier !== "all" ? sp.supplier : null;
  const kitId = sp.kit && sp.kit !== "all" ? sp.kit : null;
  const stockFilter = parseStockFilter(sp.stock);
  const gap = parseGapFilter(sp.gap);
  const page = parsePage(sp.page);
  const { column: sortColumn, ascending: sortAscending } = parseSort(sp.sort);

  const [t, tCommon, tStock, locale] = await Promise.all([
    getTranslations("parts"),
    getTranslations("common"),
    getTranslations("stockStatus"),
    getLocale(),
  ]);
  const supabase = await createClient();

  // Pre-step 1: search match against supplier_sku — PostgREST `or()` can't
  // traverse to part_supplier_offerings, so we union by id.
  let supplierSkuMatchedIds: string[] = [];
  if (q) {
    const { data } = await supabase
      .from("part_supplier_offerings")
      .select("part_id")
      .ilike("supplier_sku", `%${q}%`);
    supplierSkuMatchedIds = Array.from(
      new Set((data ?? []).map((row) => row.part_id)),
    );
  }

  // Pre-step 2: supplier filter — same constraint. Collect part_ids that
  // have an offering for the chosen supplier and filter the view by id.in().
  let supplierFilteredIds: string[] | null = null;
  if (supplierId) {
    const { data } = await supabase
      .from("part_supplier_offerings")
      .select("part_id")
      .eq("supplier_id", supplierId);
    supplierFilteredIds = Array.from(
      new Set((data ?? []).map((row) => row.part_id)),
    );
    // Empty supplier match short-circuits to zero results.
    if (supplierFilteredIds.length === 0) supplierFilteredIds = ["__none__"];
  }

  // Pre-step 2b: housekeeping gap filter — id.in() like the supplier filter.
  // The dashboard view doesn't carry origin/hs_code_id, so match on parts /
  // offerings directly.
  let gapFilteredIds: string[] | null = null;
  if (gap) {
    if (gap === "offer-price") {
      const { data } = await supabase
        .from("part_supplier_offerings")
        .select("part_id")
        .is("default_purchase_price", null);
      gapFilteredIds = Array.from(new Set((data ?? []).map((r) => r.part_id)));
    } else {
      const { data } = await supabase
        .from("parts")
        .select("id")
        .is("deleted_at", null)
        .is(gap === "origin" ? "origin" : "hs_code_id", null);
      gapFilteredIds = (data ?? []).map((r) => r.id);
    }
    if (gapFilteredIds.length === 0) gapFilteredIds = ["__none__"];
  }

  // Pre-step 3: kit filter — same id.in() pattern as the supplier filter.
  let kitFilteredIds: string[] | null = null;
  if (kitId) {
    const { data } = await supabase
      .from("part_kits")
      .select("part_id")
      .eq("kit_id", kitId);
    kitFilteredIds = Array.from(new Set((data ?? []).map((r) => r.part_id)));
    if (kitFilteredIds.length === 0) kitFilteredIds = ["__none__"];
  }

  // Categories are needed to expand a parent-category filter into its
  // descendants. Cheap query (~dozens of rows), so a separate await is fine.
  const categoriesRes = await supabase
    .from("part_categories")
    .select("id, name_en, name_da, parent_id")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  const categoryRows: FlatCategory[] = categoriesRes.data ?? [];

  // Locale-aware lookup for the list's category column. The dashboard VIEW
  // precomputes `category_name` as name_en only, so we remap it from the
  // categories list (which now carries name_da) by category_id.
  const categoryNameById = new Map<
    string,
    { en: string | null; da: string | null }
  >();
  for (const c of categoriesRes.data ?? []) {
    categoryNameById.set(c.id, { en: c.name_en, da: c.name_da });
  }
  const categoryFilterIds = categoryId
    ? descendantIds(categoryRows, categoryId)
    : null;

  // The dashboard view does the heavy lifting: stock aggregation, last-cost
  // join, status computation, supplier count, primary supplier name. Filters,
  // sort, and pagination are all DB-side.
  const offset = (page - 1) * PAGE_SIZE;

  let viewQuery = supabase
    .from("v_parts_dashboard")
    .select("*", { count: "exact" })
    .is("deleted_at", null);

  if (categoryFilterIds) viewQuery = viewQuery.in("category_id", categoryFilterIds);
  if (stockFilter !== "all") viewQuery = viewQuery.eq("stock_status", stockFilter);
  if (supplierFilteredIds) {
    viewQuery = viewQuery.in("id", supplierFilteredIds);
  }
  if (kitFilteredIds) {
    viewQuery = viewQuery.in("id", kitFilteredIds);
  }
  if (gapFilteredIds) {
    viewQuery = viewQuery.in("id", gapFilteredIds);
  }
  if (q) {
    const escaped = escapeOrValue(`%${q}%`);
    const orClauses = [
      `name_en.ilike.${escaped}`,
      `name_da.ilike.${escaped}`,
      `description_en.ilike.${escaped}`,
      `description_da.ilike.${escaped}`,
      `internal_sku.ilike.${escaped}`,
    ];
    if (supplierSkuMatchedIds.length > 0) {
      orClauses.push(`id.in.(${supplierSkuMatchedIds.join(",")})`);
    }
    viewQuery = viewQuery.or(orClauses.join(","));
  }

  viewQuery = viewQuery
    .order(sortColumn, { ascending: sortAscending, nullsFirst: false })
    .order("internal_sku", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  const [suppliersRes, kitsRes, viewRes, countRowsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id,name")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("kits")
      .select("id, sticker_color, kit_number")
      .eq("is_active", true)
      .order("sticker_color", { ascending: true })
      .order("kit_number", { ascending: true, nullsFirst: true }),
    viewQuery,
    // Catalog-wide part count per category for the drawer grid. One slim
    // column over all parts — fine at this scale (same caveat as the
    // in-memory pagination); push to a grouped view if the catalog grows.
    supabase.from("parts").select("category_id").is("deleted_at", null),
  ]);

  if (viewRes.error) {
    throw new Error(`Failed to load parts: ${viewRes.error.message}`);
  }

  const categoryCounts: Record<string, number> = {};
  for (const row of countRowsRes.data ?? []) {
    if (!row.category_id) continue;
    categoryCounts[row.category_id] = (categoryCounts[row.category_id] ?? 0) + 1;
  }

  const totalCount = viewRes.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  // Hero photos for the visible page only — same pattern as before.
  // The view's columns are nullable in the generated types (PostgreSQL views
  // can't carry NOT NULL forward), so we filter out the null-id case
  // defensively even though the underlying parts.id is never null.
  const visibleIds = (viewRes.data ?? [])
    .map((r) => r.id)
    .filter((id): id is string => id != null);
  const heroByPartId = new Map<string, string>();
  if (visibleIds.length > 0) {
    const { data: heroAttachments } = await supabase
      .from("attachments")
      .select("entity_id, file_url")
      .eq("entity_type", "part")
      .eq("purpose", "hero")
      .is("deleted_at", null)
      .in("entity_id", visibleIds);
    for (const row of heroAttachments ?? []) {
      heroByPartId.set(row.entity_id, row.file_url);
    }
  }

  // Kit labels for the visible page only — chips in the Kits column. Only
  // active kits show here; archived labels stay visible on the part detail.
  const kitsByPartId = new Map<string, PartRowKit[]>();
  if (visibleIds.length > 0) {
    const { data: memberships } = await supabase
      .from("part_kits")
      .select("part_id, kit:kits!kit_id(sticker_color, kit_number, is_active)")
      .in("part_id", visibleIds);
    for (const m of memberships ?? []) {
      const kit = Array.isArray(m.kit) ? m.kit[0] : m.kit;
      if (!kit || !kit.is_active) continue;
      const list = kitsByPartId.get(m.part_id) ?? [];
      list.push({
        sticker_color: kit.sticker_color,
        kit_number: kit.kit_number,
      });
      kitsByPartId.set(m.part_id, list);
    }
    for (const list of kitsByPartId.values()) {
      list.sort(compareKits);
    }
  }

  const pageRows: PartRow[] = (viewRes.data ?? []).map((row) => {
    const cat = row.category_id
      ? categoryNameById.get(row.category_id)
      : undefined;
    return {
    id: row.id!,
    internalSku: row.internal_sku!,
    name: row.name_en!,
    categoryName: cat ? localizedName(locale, cat.en, cat.da) : row.category_name,
    supplierName: row.primary_supplier_name,
    supplierCount: row.supplier_count ?? 0,
    stockOnHand: Number(row.stock_on_hand ?? 0),
    retailDkk:
      row.default_retail_price != null &&
      (row.default_retail_currency ?? "DKK") === "DKK"
        ? Number(row.default_retail_price)
        : null,
    stockStatus: (row.stock_status ?? "ok") as StockStatus,
    heroUrl: heroByPartId.get(row.id!) ?? null,
    kits: kitsByPartId.get(row.id!) ?? [],
    };
  });

  // Low-stock banner — empty (and invisible) until parts get reorder points.
  const reorderRes = await findPartsBelowReorderPoint();
  const reorderRows = "error" in reorderRes ? [] : reorderRes;

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
              {t("count", { count: totalCount })}
              {stockFilter !== "all"
                ? t("filteredBy", { status: tStock(stockFilter) })
                : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/parts/stock-value">
                <Coins aria-hidden /> {t("stockValue")}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link
                href={`/parts/print${
                  q || stockFilter !== "all"
                    ? `?${new URLSearchParams({
                        ...(q ? { q } : {}),
                        ...(stockFilter !== "all" ? { stock: stockFilter } : {}),
                      }).toString()}`
                    : ""
                }`}
              >
                <Printer aria-hidden /> {t("print")}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/parts/import">
                <Upload aria-hidden /> {t("importCsv")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/parts/new">
                <Plus aria-hidden /> {t("newPart")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <ReorderBanner rows={reorderRows} />

      {gap ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-money-wash px-4 py-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">
              {t(GAP_FILTERS[gap].titleKey, { count: totalCount })}
            </span>
            <span className="text-muted-foreground text-xs">
              {t(GAP_FILTERS[gap].hintKey)}
            </span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/parts">{t("clearFilter")}</Link>
          </Button>
        </div>
      ) : null}

      <PartsFilters
        categories={categoriesRes.data ?? []}
        categoryCounts={categoryCounts}
        suppliers={suppliersRes.data ?? []}
        kits={kitsRes.data ?? []}
      />

      {totalCount === 0 && !q && !categoryId && !supplierId && !kitId && !gap && stockFilter === "all" ? (
        <EmptyState
          icon={Boxes}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={{ label: t("newPart"), href: "/parts/new" }}
          secondaryAction={{ label: t("importCsv"), href: "/parts/import" }}
        />
      ) : (
        <>
          <PartsTable rows={pageRows} />

          <PartsPagination
            page={safePage}
            pageCount={pageCount}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={sp as Record<string, string | string[] | undefined>}
          />
        </>
      )}
    </div>
  );
}
