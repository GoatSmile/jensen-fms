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

import {
  PartsRecipeSection,
  type RecipeRow,
} from "./_components/parts-recipe-section";
import type { PartOption } from "./_components/part-picker-dialog";
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
        bike_model_id, bike_model_variant_id, bike_type_id,
        bike_model:bike_models(id, name_en, deleted_at),
        bike_model_variant:bike_model_variants(id, sku, name_en),
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
  // version chain. Parallel.
  const [
    recipeRes,
    catalogRes,
    chainRes,
    chainPartCountsRes,
  ] = await Promise.all([
    supabase
      .from("bike_template_parts")
      .select(
        `
          id, quantity, is_optional, notes,
          parts:parts(id, internal_sku, name_en)
        `,
      )
      .eq("template_id", id),
    supabase
      .from("parts")
      .select("id, internal_sku, name_en, category:part_categories(name_en)")
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
    supabase
      .from("bike_templates")
      .select("id, version, is_current, created_at")
      .eq("bike_model_id", t.bike_model_id)
      .filter(
        "bike_model_variant_id",
        t.bike_model_variant_id == null ? "is" : "eq",
        t.bike_model_variant_id == null ? null : t.bike_model_variant_id,
      )
      .order("version", { ascending: false }),
    supabase.from("bike_template_parts").select("template_id"),
  ]);

  const initialRows: RecipeRow[] = (recipeRes.data ?? [])
    .map((row) => ({
      partId: row.parts?.id ?? "",
      partSku: row.parts?.internal_sku ?? "—",
      partName: row.parts?.name_en ?? "—",
      quantity: String(Number(row.quantity)),
      isOptional: row.is_optional,
      notes: row.notes ?? "",
    }))
    .filter((r) => r.partId !== "")
    .sort((a, b) => a.partSku.localeCompare(b.partSku));

  const partOptions: PartOption[] = (catalogRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
    category_name: p.category?.name_en ?? null,
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
    <div className="flex flex-1 flex-col gap-6 p-6">
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
            <span className="text-muted-foreground text-xs">
              <Link
                href={`/bike-models/${t.bike_model?.id}`}
                className="hover:text-foreground hover:underline"
              >
                {t.bike_model?.name_en ?? "—"}
              </Link>
              {t.bike_model_variant ? (
                <>
                  {" · "}
                  {t.bike_model_variant.name_en}
                </>
              ) : (
                <> · any variant</>
              )}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.name_en}</h1>
          {t.name_da && t.name_da !== t.name_en ? (
            <p className="text-muted-foreground text-sm">{t.name_da}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            v{t.version}
            {t.is_current ? " · current" : ""}
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
        <p className="text-muted-foreground rounded-md border bg-muted/30 p-3 text-sm">
          {t.notes}
        </p>
      ) : null}

      <PartsRecipeSection
        templateId={t.id}
        isCurrent={t.is_current}
        initialRows={initialRows}
        parts={partOptions}
      />

      <VersionHistorySection rows={versionRows} thisTemplateId={t.id} />
    </div>
  );
}
