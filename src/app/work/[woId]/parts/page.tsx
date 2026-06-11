import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { compareKits } from "@/lib/kits/colors";
import {
  CLOSED_WO_STATUSES,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

import {
  AddPartsWorkspace,
  type CatalogPart,
  type KitCard,
  type TrayRow,
} from "./_components/add-parts-workspace";

export const dynamic = "force-dynamic";

/**
 * Technician add-parts page — a full screen instead of a dialog, so the
 * tech can add many parts (or a whole kit) in one visit and only then
 * return to the work order. Closed WOs bounce back to the workspace.
 */
export default async function AddPartsPage({
  params,
}: {
  params: Promise<{ woId: string }>;
}) {
  const { woId } = await params;
  const supabase = await createClient();

  const { data: wo, error } = await supabase
    .from("work_orders")
    .select(
      `id, wo_number, status,
       bike:bikes!bike_id(id, frame_number)`,
    )
    .eq("id", woId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load work order: ${error.message}`);
  if (!wo) notFound();
  if (CLOSED_WO_STATUSES.includes(wo.status as WorkOrderStatus)) {
    redirect(`/work/${woId}`);
  }

  const [woPartsRes, catalogRes] = await Promise.all([
    supabase
      .from("work_order_parts")
      .select(
        `id, part_id, quantity, unit_price,
         part:parts!part_id(internal_sku, name_en)`,
      )
      .eq("work_order_id", wo.id)
      .order("installed_at", { ascending: true }),
    supabase
      .from("parts")
      .select(
        "id, internal_sku, name_en, default_retail_price, default_retail_currency, category:part_categories(name_en)",
      )
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
  ]);

  const trayRows: TrayRow[] = (woPartsRes.data ?? []).map((r) => ({
    id: r.id,
    partId: r.part_id,
    sku: r.part?.internal_sku ?? "—",
    name: r.part?.name_en ?? "—",
    quantity: Number(r.quantity),
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  }));

  const catalog: CatalogPart[] = (catalogRes.data ?? []).map((p) => ({
    id: p.id,
    sku: p.internal_sku,
    name: p.name_en,
    categoryName: p.category?.name_en ?? null,
    retailDkk:
      p.default_retail_price != null &&
      (p.default_retail_currency ?? "DKK") === "DKK"
        ? Number(p.default_retail_price)
        : null,
  }));

  // ------- Kit cards -------
  // The bike's parts (as-built `bike_parts`; MO-recipe fallback for bikes
  // that never went through the build workbench), grouped by kit label.
  // Unlike the build pick list, a part with several labels counts in every
  // kit card — the bulk-add action skips already-added parts, so grabbing
  // two overlapping kits never double-adds.
  const kitCards: KitCard[] = [];
  if (wo.bike?.id) {
    const bikePartIds = new Set<string>();
    const { data: bikeParts } = await supabase
      .from("bike_parts")
      .select("part_id")
      .eq("bike_id", wo.bike.id)
      .is("removed_at", null);
    for (const r of bikeParts ?? []) bikePartIds.add(r.part_id);
    if (bikePartIds.size === 0) {
      const { data: bike } = await supabase
        .from("bikes")
        .select("manufacturing_order_id")
        .eq("id", wo.bike.id)
        .maybeSingle();
      if (bike?.manufacturing_order_id) {
        const { data: moParts } = await supabase
          .from("manufacturing_order_parts")
          .select("part_id")
          .eq("manufacturing_order_id", bike.manufacturing_order_id);
        for (const r of moParts ?? []) bikePartIds.add(r.part_id);
      }
    }

    if (bikePartIds.size > 0) {
      const { data: memberships } = await supabase
        .from("part_kits")
        .select(
          "part_id, kit:kits!kit_id(id, sticker_color, kit_number, is_active)",
        )
        .in("part_id", [...bikePartIds]);

      const onWO = new Set(trayRows.map((r) => r.partId));
      const byKit = new Map<
        string,
        {
          kitId: string;
          sticker_color: string;
          kit_number: number | null;
          partIds: Set<string>;
        }
      >();
      for (const m of memberships ?? []) {
        const kit = Array.isArray(m.kit) ? m.kit[0] : m.kit;
        if (!kit || !kit.is_active) continue;
        const entry = byKit.get(kit.id) ?? {
          kitId: kit.id,
          sticker_color: kit.sticker_color,
          kit_number: kit.kit_number,
          partIds: new Set<string>(),
        };
        entry.partIds.add(m.part_id);
        byKit.set(kit.id, entry);
      }
      kitCards.push(
        ...[...byKit.values()]
          .sort(compareKits)
          .map((k) => ({
            kitId: k.kitId,
            stickerColor: k.sticker_color,
            kitNumber: k.kit_number,
            totalParts: k.partIds.size,
            alreadyAdded: [...k.partIds].filter((p) => onWO.has(p)).length,
          })),
      );
    }
  }

  return (
    <AddPartsWorkspace
      woId={wo.id}
      woNumber={wo.wo_number}
      frameNumber={wo.bike?.frame_number ?? null}
      initialTray={trayRows}
      catalog={catalog}
      kits={kitCards}
    />
  );
}
