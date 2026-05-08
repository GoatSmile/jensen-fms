import Link from "next/link";
import { Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { getStockStatus, type StockStatus } from "@/lib/parts/stock";

import { PartsFilters } from "./_components/parts-filters";
import { PartsTable, type PartRow } from "./_components/parts-table";
import { PartsPagination } from "./_components/pagination";

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  category?: string;
  supplier?: string;
  stock?: string;
  page?: string;
};

/**
 * Escape a value for safe inclusion inside a PostgREST `or()` filter.
 * Commas, parentheses, and double-quotes break the comma-separated grammar;
 * the recommended escape is to wrap such values in double quotes.
 */
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

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const categoryId = sp.category && sp.category !== "all" ? sp.category : null;
  const supplierId = sp.supplier && sp.supplier !== "all" ? sp.supplier : null;
  const stockFilter = parseStockFilter(sp.stock);
  const page = parsePage(sp.page);

  const supabase = await createClient();

  // 1. If the user typed a search term, find the part_ids whose supplier_sku
  //    (jpNumber etc.) matches. PostgREST `or()` can't traverse to an embedded
  //    resource, so we collect ids first and union them into the parts OR.
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

  // 2. Fetch dropdown options + the parts themselves in parallel.
  const partsQueryBuilder = () => {
    // We embed offerings + the views (v_current_stock, v_part_last_cost). The
    // views relate to parts via shared `part_id`, which PostgREST auto-detects.
    // For the supplier filter we use a `!inner` join so parts without that
    // supplier are excluded; otherwise a left join keeps the row visible.
    const offeringsRel = supplierId
      ? "offerings:part_supplier_offerings!inner(is_preferred,supplier_id,suppliers(id,name))"
      : "offerings:part_supplier_offerings(is_preferred,supplier_id,suppliers(id,name))";

    let query = supabase
      .from("parts")
      .select(
        `
          id,
          internal_sku,
          name_en,
          name_da,
          category:part_categories(id,name_en),
          ${offeringsRel},
          stock:v_current_stock(quantity_on_hand),
          last_cost:v_part_last_cost(last_cost_dkk,last_purchase_quantity)
        `,
      )
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true });

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
      query = query.or(orClauses.join(","));
    }

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (supplierId) {
      // `offerings` is the embedded alias; PostgREST lets us filter the
      // foreign-table column with the same path.
      query = query.eq("offerings.supplier_id", supplierId);
    }

    return query;
  };

  const [categoriesRes, suppliersRes, partsRes] = await Promise.all([
    supabase
      .from("part_categories")
      .select("id,name_en")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("suppliers")
      .select("id,name")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    partsQueryBuilder(),
  ]);

  if (partsRes.error) {
    throw new Error(`Failed to load parts: ${partsRes.error.message}`);
  }

  // 3. Aggregate stock per part (the view is per-location), pick a primary
  //    supplier offering, derive stock status, then apply the stock filter
  //    and paginate in-memory.
  //
  //    NOTE: this approach loads all matching rows into the server before
  //    paginating. With 28 parts today this is free; once the catalogue
  //    grows past a few thousand rows we'll want to push stock-status
  //    filtering and pagination down to SQL (an extended view or RPC).
  const allRows: PartRow[] = (partsRes.data ?? []).map((part) => {
    const stockOnHand = (part.stock ?? []).reduce(
      (sum, row) => sum + Number(row.quantity_on_hand ?? 0),
      0,
    );
    const lastCostRow = part.last_cost?.[0] ?? null;
    const lastCost = lastCostRow ? Number(lastCostRow.last_cost_dkk) : null;
    const lastPurchaseQty = lastCostRow
      ? Number(lastCostRow.last_purchase_quantity)
      : null;

    const offerings = part.offerings ?? [];
    const primaryOffering =
      offerings.find((o) => o.is_preferred) ?? offerings[0] ?? null;

    return {
      id: part.id,
      internalSku: part.internal_sku,
      name: part.name_en,
      categoryName: part.category?.name_en ?? null,
      supplierName: primaryOffering?.suppliers?.name ?? null,
      supplierCount: offerings.length,
      stockOnHand,
      lastCostDkk: Number.isFinite(lastCost) ? lastCost : null,
      stockStatus: getStockStatus(stockOnHand, lastPurchaseQty),
    };
  });

  const filteredRows =
    stockFilter === "all"
      ? allRows
      : allRows.filter((row) => row.stockStatus === stockFilter);

  const totalCount = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

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
              <BreadcrumbPage>Parts</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Parts</h1>
            <p className="text-muted-foreground text-sm">
              {totalCount} {totalCount === 1 ? "part" : "parts"}
              {stockFilter !== "all" ? ` · filtered by ${stockFilter}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/parts/import">
                <Upload aria-hidden /> Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/parts/new">
                <Plus aria-hidden /> Add part
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <PartsFilters
        categories={categoriesRes.data ?? []}
        suppliers={suppliersRes.data ?? []}
      />

      <PartsTable rows={pageRows} />

      <PartsPagination
        page={safePage}
        pageCount={pageCount}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
