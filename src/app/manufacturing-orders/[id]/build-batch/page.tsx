import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";

import { localizedName } from "@/i18n/vocab";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Panel } from "@/components/ui/panel";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { loadAtSupplierBikeIds } from "@/lib/services/at-supplier";

import { BatchBuildGrid, type BatchBikeRow } from "./_components/batch-build-grid";

export const dynamic = "force-dynamic";

export default async function BuildBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: moId } = await params;
  const [t, locale] = await Promise.all([
    getTranslations("batchBuild"),
    getLocale(),
  ]);
  const supabase = await createClient();

  const { data: mo, error: moErr } = await supabase
    .from("manufacturing_orders")
    .select(
      `id, mo_number, status,
       bike_template:bike_templates(name_en, family:bike_families(name), frame_size)`,
    )
    .eq("id", moId)
    .maybeSingle();
  if (moErr) throw new Error(`Failed to load MO: ${moErr.message}`);
  if (!mo) notFound();

  // Unbuilt bikes (planning/building), in frame order — the candidates.
  const { data: unbuilt, error: bikesErr } = await supabase
    .from("bikes")
    .select("id, frame_number, frame_number_confirmed, bike_type_id")
    .eq("manufacturing_order_id", moId)
    .in("status", ["planning", "building"])
    .is("deleted_at", null)
    .order("frame_number", { ascending: true });
  if (bikesErr) throw new Error(`Failed to load bikes: ${bikesErr.message}`);

  const candidates = unbuilt ?? [];
  const moClosed = mo.status === "completed" || mo.status === "cancelled";

  // Identifier columns = the required, non-frame identifier types for these
  // bikes' type (a batch is homogeneous — use the first bike's type).
  let identifierTypes: { id: string; name: string }[] = [];
  const bikeTypeId = candidates[0]?.bike_type_id ?? null;
  if (bikeTypeId) {
    const { data: reqRows } = await supabase
      .from("bike_type_required_identifiers")
      .select("bike_identifier_type_id, is_required")
      .eq("bike_type_id", bikeTypeId);
    const requiredIds = (reqRows ?? [])
      .filter((r) => r.is_required)
      .map((r) => r.bike_identifier_type_id);
    if (requiredIds.length > 0) {
      const { data: types } = await supabase
        .from("bike_identifier_types")
        .select("id, slug, name_en, name_da, sort_order")
        .in("id", requiredIds)
        .eq("is_active", true)
        .neq("slug", "frame_number")
        .order("sort_order", { ascending: true });
      identifierTypes = (types ?? []).map((t) => ({
        id: t.id,
        name: localizedName(locale, t.name_en, t.name_da),
      }));
    }
  }

  const atPainter = await loadAtSupplierBikeIds(
    supabase,
    candidates.map((b) => b.id),
  );

  const bikes: BatchBikeRow[] = candidates.map((b) => ({
    id: b.id,
    provisionalFrame: b.frame_number,
    frameConfirmed: b.frame_number_confirmed,
    atPainter: atPainter.has(b.id),
  }));

  const templateLabel = mo.bike_template
    ? [mo.bike_template.family?.name, mo.bike_template.frame_size, mo.bike_template.name_en]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/manufacturing-orders">{t("crumbMos")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/manufacturing-orders/${moId}`}>
                <SegmentedId value={mo.mo_number} />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("intro")}
          {templateLabel ? ` ${templateLabel}.` : ""}
        </p>
      </header>

      {moClosed ? (
        // `bg-ground` is the fill for an empty state INSIDE a panel. At page
        // level the page is already ground, so the same fill is invisible —
        // a page-level notice needs the surface, i.e. a panel of its own.
        <Panel contentClassName="text-ink-3 text-sm">
          {t("moClosed", { status: t(`moStatus.${mo.status}`) })}
        </Panel>
      ) : bikes.length === 0 ? (
        <Panel contentClassName="text-ink-3 text-sm">{t("noUnbuilt")}</Panel>
      ) : (
        <BatchBuildGrid
          moId={moId}
          moNumber={mo.mo_number}
          bikes={bikes}
          identifierTypes={identifierTypes}
        />
      )}
    </div>
  );
}
