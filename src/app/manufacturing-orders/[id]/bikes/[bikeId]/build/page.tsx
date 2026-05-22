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
import { createClient } from "@/lib/supabase/server";
import type { BikeStatus } from "@/lib/bikes/status";

import {
  BuildWorkbench,
  type BikePartRow,
  type CategoryOption,
  type PartInCatalog,
} from "./_components/build-workbench";

export default async function BikeBuildWorkbenchPage({
  params,
}: {
  params: Promise<{ id: string; bikeId: string }>;
}) {
  const { id: moId, bikeId } = await params;
  const supabase = await createClient();

  const [
    moRes,
    bikeRes,
    bikePartsRes,
    moRecipeCountRes,
    categoriesRes,
    catalogRes,
  ] = await Promise.all([
    supabase
      .from("manufacturing_orders")
      .select(
        `id, mo_number, status,
         bike_template:bike_templates(id, name_en, family, frame_size),
         color:colors(name_en, hex)`,
      )
      .eq("id", moId)
      .maybeSingle(),
    supabase
      .from("bikes")
      .select("id, frame_number, status, build_cost_dkk, manufacturing_order_id")
      .eq("id", bikeId)
      .maybeSingle(),
    supabase
      .from("bike_parts")
      .select(
        `id, part_id, quantity, inventory_movement_id, notes,
         part:parts!part_id(
           id, internal_sku, name_en,
           category:part_categories(id, name_en)
         )`,
      )
      .eq("bike_id", bikeId)
      .is("removed_at", null)
      .order("installed_at", { ascending: true }),
    supabase
      .from("manufacturing_order_parts")
      .select("id", { count: "exact", head: true })
      .eq("manufacturing_order_id", moId),
    supabase
      .from("part_categories")
      .select("id, name_en, sort_order")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("parts")
      .select("id, internal_sku, name_en, category_id")
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
  ]);

  if (moRes.error) throw new Error(moRes.error.message);
  if (!moRes.data) notFound();
  if (bikeRes.error) throw new Error(bikeRes.error.message);
  if (!bikeRes.data) notFound();
  if (bikeRes.data.manufacturing_order_id !== moId) notFound();

  const mo = moRes.data;
  const bike = bikeRes.data;

  // Stock lookup keyed by part_id — picker shows on-hand inline.
  const stockByPart = new Map<string, number>();
  {
    const { data: stock } = await supabase
      .from("v_current_stock")
      .select("part_id, quantity_on_hand");
    for (const row of stock ?? []) {
      if (!row.part_id) continue;
      stockByPart.set(
        row.part_id,
        (stockByPart.get(row.part_id) ?? 0) + Number(row.quantity_on_hand ?? 0),
      );
    }
  }

  const bikeParts: BikePartRow[] = (bikePartsRes.data ?? [])
    .filter((r) => r.part_id)
    .map((r) => ({
      id: r.id,
      partId: r.part_id,
      partSku: r.part?.internal_sku ?? "—",
      partName: r.part?.name_en ?? "—",
      categoryId: r.part?.category?.id ?? null,
      categoryName: r.part?.category?.name_en ?? null,
      quantity: Number(r.quantity),
      consumed: r.inventory_movement_id != null,
      notes: r.notes,
      onHand: stockByPart.get(r.part_id) ?? 0,
    }));

  const categories: CategoryOption[] = (categoriesRes.data ?? []).map((c) => ({
    id: c.id,
    name_en: c.name_en,
    sortOrder: c.sort_order,
  }));
  const catalog: PartInCatalog[] = (catalogRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
    category_id: p.category_id ?? null,
    onHand: stockByPart.get(p.id) ?? 0,
  }));

  const recipeRowCount = moRecipeCountRes.count ?? 0;

  const templateLabel = mo.bike_template
    ? [
        mo.bike_template.family,
        mo.bike_template.frame_size,
        mo.bike_template.name_en,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const moClosed = mo.status === "completed" || mo.status === "cancelled";
  const bikeStatus = bike.status as BikeStatus;
  const isReadOnly =
    moClosed ||
    bikeStatus === "in_stock" ||
    bikeStatus === "assigned" ||
    bikeStatus === "in_service" ||
    bikeStatus === "retired" ||
    bikeStatus === "lost_or_stolen";

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
            <BreadcrumbLink asChild>
              <Link
                href={`/manufacturing-orders/${moId}`}
                className="font-mono"
              >
                {mo.mo_number}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              Build{" "}
              <span className="font-mono">{bike.frame_number}</span>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <BuildWorkbench
        moId={moId}
        moNumber={mo.mo_number}
        bikeId={bikeId}
        bikeFrameNumber={bike.frame_number}
        bikeStatus={bikeStatus}
        bikeBuildCostDkk={
          bike.build_cost_dkk != null ? Number(bike.build_cost_dkk) : null
        }
        templateLabel={templateLabel}
        colorName={mo.color?.name_en ?? null}
        colorHex={mo.color?.hex ?? null}
        initialBikeParts={bikeParts}
        categories={categories}
        catalog={catalog}
        moRecipeRowCount={recipeRowCount}
        readOnly={isReadOnly}
      />
    </div>
  );
}
