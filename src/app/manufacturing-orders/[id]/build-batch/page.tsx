import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { loadAtPainterBikeIds } from "@/lib/paint/at-painter";

import { BatchBuildGrid, type BatchBikeRow } from "./_components/batch-build-grid";

export const dynamic = "force-dynamic";

export default async function BuildBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: moId } = await params;
  const supabase = await createClient();

  const { data: mo, error: moErr } = await supabase
    .from("manufacturing_orders")
    .select(
      `id, mo_number, status,
       bike_template:bike_templates(name_en, family, frame_size)`,
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
        .select("id, slug, name_en, sort_order")
        .in("id", requiredIds)
        .eq("is_active", true)
        .neq("slug", "frame_number")
        .order("sort_order", { ascending: true });
      identifierTypes = (types ?? []).map((t) => ({ id: t.id, name: t.name_en }));
    }
  }

  const atPainter = await loadAtPainterBikeIds(
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
    ? [mo.bike_template.family, mo.bike_template.frame_size, mo.bike_template.name_en]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/manufacturing-orders">Manufacturing orders</Link>
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
            <BreadcrumbPage>Bulk build</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Bulk build</h1>
        <p className="text-muted-foreground text-sm">
          Build several identical bikes at once — the parts come from the recipe;
          you only enter each bike&rsquo;s frame number and identifiers here.
          {templateLabel ? ` ${templateLabel}.` : ""}
        </p>
      </header>

      {moClosed ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
          This MO is {mo.status} — nothing left to build.
        </p>
      ) : bikes.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
          No unbuilt bikes on this MO. Add bikes from the MO page first.
        </p>
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
