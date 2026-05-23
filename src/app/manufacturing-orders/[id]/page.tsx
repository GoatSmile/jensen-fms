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
import { formatDate } from "@/lib/parts/format";
import type { BikeStatus } from "@/lib/bikes/status";
import type { MOStatus } from "@/lib/mo/status";
import { nextFrameNumberFromDb } from "@/lib/bikes/frame-number";

import { MOBikesSection, type MOBikeRow } from "./_components/mo-bikes-section";
import { MOHeader } from "./_components/mo-header";
import {
  MOPartsSection,
  type CategoryOption,
  type MOPartRow,
  type PartInCatalog,
} from "./_components/mo-parts-section";
import type { PartChoice } from "./_components/substitute-part-dialog";
import { Section } from "./_components/section";

export default async function ManufacturingOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const moRes = await supabase
    .from("manufacturing_orders")
    .select(
      `
        id, mo_number, status, target_quantity, completed_quantity,
        planned_start_date, planned_completion_date,
        actual_start_date, actual_completion_date,
        notes, created_at,
        bike_template_id, bike_type_id, color_id,
        bike_type:bike_types(id, name_en, slug),
        bike_template:bike_templates(id, name_en, family, frame_size, version, is_current),
        color:colors(id, slug, name_en, hex)
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (moRes.error) {
    throw new Error(`Failed to load MO: ${moRes.error.message}`);
  }
  if (!moRes.data) notFound();

  const mo = moRes.data;
  const closed = mo.status === "completed" || mo.status === "cancelled";

  // Pull MO parts + their stock + the "substituted from" name in parallel.
  const [
    moPartsRes,
    bikesRes,
    partsCatalogRes,
    bikeTypeRequiredRes,
    categoriesRes,
  ] = await Promise.all([
    supabase
      .from("manufacturing_order_parts")
      .select(
        `
          id, part_id, quantity_per_bike, origin, substituted_part_id, notes,
          part:parts!part_id(
            id, internal_sku, name_en,
            category:part_categories(id, name_en)
          ),
          substituted_from:parts!substituted_part_id(id, internal_sku, name_en)
        `,
      )
      .eq("manufacturing_order_id", id),
    supabase
      .from("bikes")
      .select(
        `
          id, frame_number, status, manufacturing_order_id, build_cost_dkk,
          owner_organization:organizations!owner_organization_id(
            id, legal_name, display_name_en, display_name_da
          ),
          owner_unit:organization_units!owner_unit_id(id, name),
          bike_identifiers(id, is_active)
        `,
      )
      .eq("manufacturing_order_id", id)
      .is("deleted_at", null)
      .order("frame_number", { ascending: true }),
    supabase
      .from("parts")
      .select(
        `id, internal_sku, name_en, category_id,
         category:part_categories(name_en)`,
      )
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
    supabase
      .from("bike_type_required_identifiers")
      .select("bike_type_id, bike_identifier_type_id, is_required")
      .eq("bike_type_id", mo.bike_type_id)
      .eq("is_required", true),
    // 57 active categories — drives the LEFT-column picker.
    supabase
      .from("part_categories")
      .select("id, name_en, sort_order")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
  ]);

  // Stock lookup keyed by part_id, summed across all locations. We pull
  // for the WHOLE catalog (not just MO parts) so the picker dropdowns can
  // show on-hand next to each candidate without N+1 round-trips.
  const stockByPart = new Map<string, number>();
  {
    const { data: stock } = await supabase
      .from("v_current_stock")
      .select("part_id, quantity_on_hand");
    for (const row of stock ?? []) {
      const key = row.part_id;
      if (!key) continue;
      stockByPart.set(
        key,
        (stockByPart.get(key) ?? 0) + Number(row.quantity_on_hand ?? 0),
      );
    }
  }

  const moPartRows: MOPartRow[] = (moPartsRes.data ?? [])
    .map((row) => ({
      id: row.id,
      partId: row.part_id,
      partSku: row.part?.internal_sku ?? "—",
      partName: row.part?.name_en ?? "—",
      categoryId: row.part?.category?.id ?? null,
      categoryName: row.part?.category?.name_en ?? null,
      quantityPerBike: Number(row.quantity_per_bike),
      origin: row.origin as MOPartRow["origin"],
      substitutedFromPartName: row.substituted_from?.name_en ?? null,
      notes: row.notes,
      onHand: stockByPart.get(row.part_id) ?? 0,
    }))
    .sort((a, b) => a.partSku.localeCompare(b.partSku));

  // Picker data: every active category + every active part with its
  // current stock (passed to the LEFT-column dropdowns).
  const categories: CategoryOption[] = (categoriesRes.data ?? []).map((c) => ({
    id: c.id,
    name_en: c.name_en,
    sortOrder: c.sort_order,
  }));
  const partsCatalogWithStock: PartInCatalog[] = (partsCatalogRes.data ?? []).map(
    (p) => ({
      id: p.id,
      internal_sku: p.internal_sku,
      name_en: p.name_en,
      category_id: p.category_id ?? null,
      onHand: stockByPart.get(p.id) ?? 0,
    }),
  );

  // Projected build cost = Σ (qty/bike × last_cost_dkk × outstanding bikes).
  // last_cost_dkk per part comes from v_part_last_cost.
  const moPartIds = moPartRows.map((r) => r.partId);
  const lastCostByPart = new Map<string, number>();
  if (moPartIds.length > 0) {
    const { data: costs } = await supabase
      .from("v_part_last_cost")
      .select("part_id, last_cost_dkk")
      .in("part_id", moPartIds);
    for (const c of costs ?? []) {
      if (!c.part_id) continue;
      lastCostByPart.set(c.part_id, Number(c.last_cost_dkk ?? 0));
    }
  }
  const projectedPartsCostPerBike = moPartRows.reduce((sum, r) => {
    const lc = lastCostByPart.get(r.partId) ?? 0;
    return sum + r.quantityPerBike * lc;
  }, 0);
  // Total projected build cost is multiplied by outstandingBikes below
  // (it depends on moBikeRows which we compute next).

  const requiredIdCount = bikeTypeRequiredRes.data?.length ?? 0;
  const moBikeRows: MOBikeRow[] = (bikesRes.data ?? []).map((b) => {
    const ownerName =
      b.owner_organization?.display_name_da ??
      b.owner_organization?.display_name_en ??
      b.owner_organization?.legal_name ??
      null;
    return {
      id: b.id,
      frameNumber: b.frame_number,
      status: b.status as BikeStatus,
      identifierCount:
        b.bike_identifiers?.filter((bi) => bi.is_active).length ?? 0,
      requiredIdentifierCount: requiredIdCount,
      ownerName,
      ownerUnitName: b.owner_unit?.name ?? null,
    };
  });

  // Build cost stats: sum across all bikes that have build_cost_dkk stamped.
  const builtBikesWithCost = (bikesRes.data ?? []).filter(
    (b) => b.build_cost_dkk != null,
  );
  const totalBuildCost = builtBikesWithCost.reduce(
    (sum, b) => sum + Number(b.build_cost_dkk ?? 0),
    0,
  );
  const avgBuildCost =
    builtBikesWithCost.length > 0
      ? totalBuildCost / builtBikesWithCost.length
      : null;

  const partsCatalog: PartChoice[] = (partsCatalogRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
    category_name: p.category?.name_en ?? null,
  }));

  // Compute outstanding bikes for the parts stock-check (target − attached).
  const outstandingBikes = Math.max(0, mo.target_quantity - moBikeRows.length);
  const projectedBuildCost = projectedPartsCostPerBike * outstandingBikes;

  // Frame-number suggestion for the next bike. With models gone, we derive
  // the prefix from the bike_type's slug (uppercased, e.g. "hsb" → "HSB").
  // The lookup is GLOBAL (not scoped to this MO) — bike frame_number is
  // unique table-wide, so a per-MO scope let a new MO suggest `001` that
  // already belonged to a sibling MO.
  const suggestedFrameNumber = await nextFrameNumberFromDb(supabase, {
    year: new Date().getFullYear(),
    code: mo.bike_type?.slug ?? null,
  });

  const templateLabel = mo.bike_template
    ? [
        mo.bike_template.family,
        mo.bike_template.frame_size,
        mo.bike_template.name_en,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

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
              <Link href="/manufacturing-orders">Manufacturing orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              <SegmentedId value={mo.mo_number} />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <MOHeader
        moId={mo.id}
        moNumber={mo.mo_number}
        status={mo.status as MOStatus}
        templateLabel={templateLabel}
        templateId={mo.bike_template?.id ?? null}
        templateVersion={mo.bike_template?.version ?? null}
        bikeTypeName={mo.bike_type?.name_en ?? null}
        colorName={mo.color?.name_en ?? null}
        colorHex={mo.color?.hex ?? null}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Target" value={String(mo.target_quantity)} />
        <Stat label="Completed" value={String(mo.completed_quantity)} />
        <Stat label="Outstanding" value={String(outstandingBikes)} />
        <Stat label="Parts in recipe" value={String(moPartRows.length)} />
        <Stat
          label="Build cost so far"
          value={
            totalBuildCost > 0
              ? new Intl.NumberFormat("da-DK", {
                  style: "currency",
                  currency: "DKK",
                  maximumFractionDigits: 0,
                }).format(totalBuildCost)
              : "—"
          }
        />
        <Stat
          label="Avg cost per bike"
          value={
            avgBuildCost != null
              ? new Intl.NumberFormat("da-DK", {
                  style: "currency",
                  currency: "DKK",
                  maximumFractionDigits: 0,
                }).format(avgBuildCost)
              : "—"
          }
        />
        <Stat
          label="Projected per bike"
          value={
            projectedPartsCostPerBike > 0
              ? new Intl.NumberFormat("da-DK", {
                  style: "currency",
                  currency: "DKK",
                  maximumFractionDigits: 0,
                }).format(projectedPartsCostPerBike)
              : "—"
          }
        />
        <Stat
          label="Projected remaining"
          value={
            projectedBuildCost > 0
              ? new Intl.NumberFormat("da-DK", {
                  style: "currency",
                  currency: "DKK",
                  maximumFractionDigits: 0,
                }).format(projectedBuildCost)
              : "—"
          }
        />
      </div>

      <Section title="Plan" description="Planned and actual dates and notes.">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Planned start">
            {formatDate(mo.planned_start_date)}
          </Field>
          <Field label="Planned completion">
            {formatDate(mo.planned_completion_date)}
          </Field>
          <Field label="Actual start">
            {formatDate(mo.actual_start_date)}
          </Field>
          <Field label="Actual completion">
            {formatDate(mo.actual_completion_date)}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              {mo.notes ? (
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {mo.notes}
                </pre>
              ) : (
                <Muted>—</Muted>
              )}
            </Field>
          </div>
        </dl>
      </Section>

      <MOPartsSection
        moId={mo.id}
        rows={moPartRows}
        outstandingBikes={outstandingBikes}
        partsCatalog={partsCatalog}
        catalog={partsCatalogWithStock}
        categories={categories}
        hasTemplate={mo.bike_template?.id != null}
        readOnly={closed}
      />

      <MOBikesSection
        moId={mo.id}
        rows={moBikeRows}
        targetQuantity={mo.target_quantity}
        completedQuantity={mo.completed_quantity}
        suggestedFrameNumber={suggestedFrameNumber}
        closed={closed}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
