import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

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
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

import {
  PartsRecipeSection,
  type CategoryOption,
  type PartInCategory,
  type RecipeRow,
} from "./_components/parts-recipe-section";
import { LabelBomKit } from "./_components/label-bom-kit";
import {
  VersionHistorySection,
  type VersionRow,
} from "./_components/version-history-section";

export default async function BikeTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const tplRes = await supabase
    .from("bike_templates")
    .select(
      `
        id, name_en, name_da, notes, version, is_current, created_at,
        bike_type_id, family, frame_size,
        default_retail_price, default_retail_currency,
        bike_type:bike_types(id, name_en)
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (tplRes.error) {
    throw new Error(`Failed to load template: ${tplRes.error.message}`);
  }
  if (!tplRes.data) notFound();

  const t = tplRes.data;

  // Fetch parts in this template, the catalog of pickable parts, and the full
  // version chain. Version chain is templates with the same family + frame_size
  // (or just same name_en if family is unset).
  const chainFilters = t.family
    ? supabase
        .from("bike_templates")
        .select("id, version, is_current, created_at")
        .eq("family", t.family)
        .eq("frame_size", t.frame_size)
    : supabase
        .from("bike_templates")
        .select("id, version, is_current, created_at")
        .is("family", null)
        .eq("name_en", t.name_en);

  const [
    recipeRes,
    categoriesRes,
    catalogRes,
    chainRes,
    chainPartCountsRes,
    kitsRes,
  ] = await Promise.all([
    supabase
      .from("bike_template_parts")
      .select(
        `
        id, quantity, is_optional, notes,
        parts:parts(
          id, internal_sku, name_en,
          default_retail_price, default_retail_currency,
          category:part_categories(id, name_en, name_da)
        )
      `,
      )
      .eq("template_id", id),
    // All 57 active categories — these drive the LEFT column of the new
    // category-driven picker. Sort by sort_order so the list mirrors the
    // FleetManager Pro spec Dennis pointed at.
    supabase
      .from("part_categories")
      .select("id, name_en, name_da, sort_order")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("parts")
      .select(
        "id, internal_sku, name_en, category_id, default_retail_price, default_retail_currency",
      )
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
    chainFilters.order("version", { ascending: false }),
    supabase.from("bike_template_parts").select("template_id"),
    supabase
      .from("kits")
      .select("id, sticker_color, kit_number")
      .eq("is_active", true)
      .order("sticker_color", { ascending: true })
      .order("kit_number", { ascending: true, nullsFirst: true }),
  ]);

  const initialRows: RecipeRow[] = (recipeRes.data ?? [])
    .map((row) => ({
      partId: row.parts?.id ?? "",
      partSku: row.parts?.internal_sku ?? "—",
      partName: row.parts?.name_en ?? "—",
      categoryId: row.parts?.category?.id ?? null,
      categoryName: row.parts?.category?.name_en ?? null,
      quantity: String(Number(row.quantity)),
      isOptional: row.is_optional,
      notes: row.notes ?? "",
      retailDkk:
        row.parts?.default_retail_price != null &&
        (row.parts.default_retail_currency ?? "DKK") === "DKK"
          ? Number(row.parts.default_retail_price)
          : null,
    }))
    .filter((r) => r.partId !== "")
    .sort((a, b) => a.partSku.localeCompare(b.partSku));

  const categories: CategoryOption[] = (categoriesRes.data ?? []).map((c) => ({
    id: c.id,
    name_en: c.name_en,
    name_da: c.name_da,
    sortOrder: c.sort_order,
  }));

  const parts: PartInCategory[] = (catalogRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
    category_id: p.category_id ?? null,
    retailDkk:
      p.default_retail_price != null &&
      (p.default_retail_currency ?? "DKK") === "DKK"
        ? Number(p.default_retail_price)
        : null,
  }));

  const chainCounts = new Map<string, number>();
  for (const row of chainPartCountsRes.data ?? []) {
    chainCounts.set(
      row.template_id,
      (chainCounts.get(row.template_id) ?? 0) + 1,
    );
  }
  const versionRows: VersionRow[] = (chainRes.data ?? []).map((v) => ({
    id: v.id,
    version: v.version,
    isCurrent: v.is_current,
    createdAt: v.created_at,
    partCount: chainCounts.get(v.id) ?? 0,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/bike-templates">Bike templates</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t.name_en}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {!t.is_current ? (
        <div className="bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300 rounded-md border border-amber-300 px-3 py-2 text-sm">
          This is version {t.version} of the template. The current version may
          have a different recipe.
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {t.bike_type?.name_en ?? "—"}
            </Badge>
            {t.family ? (
              <span className="text-muted-foreground text-xs">
                {t.family} · {t.frame_size}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">
                {t.frame_size}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.name_en}</h1>
          {t.name_da && t.name_da !== t.name_en ? (
            <p className="text-muted-foreground text-sm">{t.name_da}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            v{t.version}
            {t.is_current ? " · current" : ""}
            {" · "}
            {formatPrice(
              t.default_retail_price == null
                ? null
                : Number(t.default_retail_price),
              t.default_retail_currency,
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/bike-templates/${t.id}/edit`}>
              <Pencil aria-hidden /> Edit
            </Link>
          </Button>
        </div>
      </div>

      {t.notes ? (
        <p className="text-muted-foreground bg-muted/30 rounded-md border p-3 text-sm">
          {t.notes}
        </p>
      ) : null}

      <PartsRecipeSection
        templateId={t.id}
        isCurrent={t.is_current}
        initialRows={initialRows}
        categories={categories}
        parts={parts}
        templateRetailDkk={
          t.default_retail_price != null &&
          (t.default_retail_currency ?? "DKK") === "DKK"
            ? Number(t.default_retail_price)
            : null
        }
      />

      <LabelBomKit
        templateId={t.id}
        kits={kitsRes.data ?? []}
        bomPartCount={initialRows.length}
      />

      <VersionHistorySection rows={versionRows} thisTemplateId={t.id} />
    </div>
  );
}
