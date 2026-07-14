import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
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
import { familyTint } from "@/lib/bike-templates/family-colors";
import { loadTemplatePaintEstimate } from "@/lib/services/template-paint";
import { loadActiveServicePartTypes } from "@/lib/services/vocab";
import { localizedName } from "@/i18n/vocab";

import {
  PartsRecipeSection,
  type CategoryOption,
  type PartInCategory,
  type RecipeRow,
} from "./_components/parts-recipe-section";
import { PaintworkSection } from "./_components/paintwork-section";
import { DeleteTemplateButton } from "./_components/delete-template-button";
import { DuplicateTemplateButton } from "./_components/duplicate-template-button";
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
  const [t, tTpl, tCommon, locale] = await Promise.all([
    getTranslations("templateDetail"),
    getTranslations("templates"),
    getTranslations("common"),
    getLocale(),
  ]);
  const supabase = await createClient();

  const tplRes = await supabase
    .from("bike_templates")
    .select(
      `
        id, name_en, name_da, notes, version, is_current, created_at,
        bike_type_id, family_id, family:bike_families(name), frame_size,
        default_retail_price, default_retail_currency,
        bike_type:bike_types(id, name_en, name_da)
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (tplRes.error) {
    throw new Error(`Failed to load template: ${tplRes.error.message}`);
  }
  if (!tplRes.data) notFound();

  const tpl = tplRes.data;

  // Fetch parts in this template, the catalog of pickable parts, and the full
  // version chain. Version chain is templates with the same family_id +
  // frame_size (or just same name_en if family_id is unset).
  const chainFilters = tpl.family_id
    ? supabase
        .from("bike_templates")
        .select("id, version, is_current, created_at")
        .eq("family_id", tpl.family_id)
        .eq("frame_size", tpl.frame_size)
    : supabase
        .from("bike_templates")
        .select("id, version, is_current, created_at")
        .is("family_id", null)
        .eq("name_en", tpl.name_en);

  const [
    recipeRes,
    categoriesRes,
    catalogRes,
    chainRes,
    chainPartCountsRes,
    kitsRes,
    kitMembershipsRes,
    lastCostRes,
    paintEstimate,
    servicePartTypes,
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
    supabase.from("part_kits").select("part_id, kit_id"),
    // Last landed purchase cost per part (additive transport+tariff+anti-dumping,
    // frozen at purchase) — the same figure the MO build-cost projection uses.
    // Drives the "cost to produce" total Dennis asked for.
    supabase.from("v_part_last_cost").select("part_id, last_cost_dkk"),
    // Paintwork declaration priced against the default painter's current
    // list — joins the parts cost in the cost-to-produce + margin box.
    loadTemplatePaintEstimate(supabase, id),
    loadActiveServicePartTypes(supabase),
  ]);

  // part_id → last landed cost (DKK/unit). Parts with no purchase history are
  // absent and surface as "uncosted" in the recipe summary.
  const costByPart = new Map<string, number>();
  for (const row of lastCostRes.data ?? []) {
    if (row.part_id != null && row.last_cost_dkk != null) {
      costByPart.set(row.part_id, Number(row.last_cost_dkk));
    }
  }

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
      costDkk: row.parts?.id ? costByPart.get(row.parts.id) ?? null : null,
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
    costDkk: costByPart.get(p.id) ?? null,
  }));

  const chainCounts = new Map<string, number>();
  for (const row of chainPartCountsRes.data ?? []) {
    chainCounts.set(
      row.template_id,
      (chainCounts.get(row.template_id) ?? 0) + 1,
    );
  }
  // kit_id → part_id[] for the recipe editor's "add from kit" bulk action.
  // Only active kits (kitsRes is already filtered) get an entry.
  const activeKitIds = new Set((kitsRes.data ?? []).map((k) => k.id));
  const kitParts: Record<string, string[]> = {};
  for (const m of kitMembershipsRes.data ?? []) {
    if (!activeKitIds.has(m.kit_id)) continue;
    (kitParts[m.kit_id] ??= []).push(m.part_id);
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
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/bike-templates">{tTpl("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{tpl.name_en}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {!tpl.is_current ? (
        <div className="bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300 rounded-md border border-amber-300 px-3 py-2 text-sm">
          {t("pastVersionBanner", { version: tpl.version })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {tpl.bike_type
                ? localizedName(
                    locale,
                    tpl.bike_type.name_en,
                    tpl.bike_type.name_da,
                  )
                : "—"}
            </Badge>
            {tpl.family?.name && tpl.family_id ? (
              // Family chip in the family's colour — links back to this
              // family's group on the templates list.
              <Link
                href={`/bike-templates#family-${tpl.family_id}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${familyTint(tpl.family_id).chip}`}
              >
                <span
                  className={`size-1.5 rounded-full ${familyTint(tpl.family_id).dot}`}
                  aria-hidden
                />
                {tpl.family.name}
              </Link>
            ) : null}
            <span className="text-muted-foreground text-xs">
              {tpl.frame_size}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{tpl.name_en}</h1>
          {tpl.name_da && tpl.name_da !== tpl.name_en ? (
            <p className="text-muted-foreground text-sm">{tpl.name_da}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            v{tpl.version}
            {tpl.is_current ? tTpl("currentSuffix") : ""}
            {" · "}
            {formatPrice(
              tpl.default_retail_price == null
                ? null
                : Number(tpl.default_retail_price),
              tpl.default_retail_currency,
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <DeleteTemplateButton templateId={tpl.id} />
          <DuplicateTemplateButton templateId={tpl.id} />
          <Button variant="outline" asChild>
            <Link href={`/bike-templates/${tpl.id}/edit`}>
              <Pencil aria-hidden /> {t("edit")}
            </Link>
          </Button>
        </div>
      </div>

      {tpl.notes ? (
        <p className="text-muted-foreground bg-muted/30 rounded-md border p-3 text-sm">
          {tpl.notes}
        </p>
      ) : null}

      <PartsRecipeSection
        templateId={tpl.id}
        isCurrent={tpl.is_current}
        initialRows={initialRows}
        categories={categories}
        parts={parts}
        kits={kitsRes.data ?? []}
        kitParts={kitParts}
        templateRetailDkk={
          tpl.default_retail_price != null &&
          (tpl.default_retail_currency ?? "DKK") === "DKK"
            ? Number(tpl.default_retail_price)
            : null
        }
        paintEstimate={
          paintEstimate.rows.length > 0
            ? {
                totalDkk: paintEstimate.totalDkk,
                totalLabel: paintEstimate.totalLabel,
                listLabel: paintEstimate.listLabel,
              }
            : null
        }
      />

      <PaintworkSection
        templateId={tpl.id}
        isCurrent={tpl.is_current}
        rows={paintEstimate.rows.map((r) => ({
          ...r,
          partTypeName: localizedName(locale, r.partTypeName, r.partTypeNameDa),
        }))}
        partTypes={servicePartTypes.map((pt) => ({
          ...pt,
          name_en: localizedName(locale, pt.name_en, pt.name_da),
        }))}
        totalLabel={paintEstimate.totalLabel}
        listLabel={paintEstimate.listLabel}
        unpricedCount={paintEstimate.unpricedCount}
      />

      <LabelBomKit
        templateId={tpl.id}
        kits={kitsRes.data ?? []}
        bomPartCount={initialRows.length}
      />

      <VersionHistorySection rows={versionRows} thisTemplateId={tpl.id} />
    </div>
  );
}
