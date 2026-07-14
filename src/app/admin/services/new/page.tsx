import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import { localizedName } from "@/i18n/vocab";

import {
  RevisionEditor,
  type EditorSourceList,
  type TierCol,
} from "./_components/revision-editor";

/** Fresh lists start with the painter's familiar three-tier shape. */
const DEFAULT_TIERS: TierCol[] = [
  { min: 1, max: 9 },
  { min: 10, max: 19 },
  { min: 20, max: null },
];

/**
 * New price-list revision editor. `?from=<listId>` duplicates that revision
 * (the yearly-bump flow: same structure, new numbers, live diff); without
 * it, the editor starts a supplier × service type's FIRST list.
 */
export default async function NewServicePriceListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("adminServices"),
    getTranslations("common"),
    getLocale(),
  ]);
  const supabase = await createClient();

  const [partTypesRes, currenciesRes, suppliersRes, typesRes] =
    await Promise.all([
      supabase
        .from("service_part_types")
        .select("id, name_en, name_da, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("currencies")
        .select("code")
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true }),
      supabase
        .from("suppliers")
        .select("id, name")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("service_types")
        .select("id, name_en, name_da")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

  let source: EditorSourceList | null = null;
  if (from) {
    const { data: src, error } = await supabase
      .from("service_price_lists")
      .select(
        `
          id, name, currency, effective_from, version,
          supplier_id, service_type_id,
          supplier:suppliers(name),
          service_type:service_types(name_en, name_da),
          items:service_price_items(
            service_part_type_id, supplier_item_no, tier_min, tier_max, unit_price
          )
        `,
      )
      .eq("id", from)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load source list: ${error.message}`);
    }
    if (!src) notFound();
    source = {
      id: src.id,
      name: src.name,
      currency: src.currency,
      effectiveFrom: src.effective_from,
      version: src.version,
      supplierId: src.supplier_id,
      serviceTypeId: src.service_type_id,
      supplierName: one(src.supplier)?.name ?? "—",
      serviceTypeName:
        localizedName(
          locale,
          one(src.service_type)?.name_en,
          one(src.service_type)?.name_da,
        ) || "—",
      items: (src.items ?? []).map((i) => ({
        servicePartTypeId: i.service_part_type_id,
        supplierItemNo: i.supplier_item_no,
        tierMin: i.tier_min,
        tierMax: i.tier_max,
        unitPrice: Number(i.unit_price),
      })),
    };
  }

  // Duplication keeps the source's tier structure; a fresh list starts with
  // the standard three tiers. Changing tier boundaries stays a rare SQL job.
  const tiers: TierCol[] = source
    ? (() => {
        const seen = new Set<string>();
        const cols: TierCol[] = [];
        for (const item of source.items) {
          const key = `${item.tierMin}:${item.tierMax ?? "open"}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cols.push({ min: item.tierMin, max: item.tierMax });
        }
        cols.sort((a, b) => a.min - b.min);
        return cols.length > 0 ? cols : DEFAULT_TIERS;
      })()
    : DEFAULT_TIERS;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
            <BreadcrumbLink asChild>
              <Link href="/admin/services">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {source ? t("newRevision") : t("newPriceList")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {source
            ? t("newRevisionHeading", {
                serviceType: source.serviceTypeName,
                supplier: source.supplierName,
              })
            : t("newPriceList")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {source
            ? t("newRevisionSubtitle", {
                name: source.name,
                version: source.version,
              })
            : t("newPriceListSubtitle")}
        </p>
      </div>

      <RevisionEditor
        source={source}
        tiers={tiers}
        partTypes={partTypesRes.data ?? []}
        currencies={(currenciesRes.data ?? []).map((c) => c.code)}
        suppliers={suppliersRes.data ?? []}
        serviceTypes={typesRes.data ?? []}
      />
    </div>
  );
}
