import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { localizedName } from "@/i18n/vocab";
import { createClient } from "@/lib/supabase/server";
import type { BikeStatus } from "@/lib/bikes/status";
import { compareKits } from "@/lib/kits/colors";
import { loadBikeIdentifierContext } from "@/lib/bikes/identifier-context";
import { loadAtSupplierBikeIds } from "@/lib/services/at-supplier";

import {
  BuildWorkbench,
  type BikePartRow,
  type CategoryOption,
  type PartInCatalog,
} from "./_components/build-workbench";
import {
  PickList,
  type PickGroup,
  type PickRow,
} from "./_components/pick-list";

export default async function BikeBuildWorkbenchPage({
  params,
}: {
  params: Promise<{ id: string; bikeId: string }>;
}) {
  const { id: moId, bikeId } = await params;
  const [t, locale] = await Promise.all([
    getTranslations("build"),
    getLocale(),
  ]);
  const supabase = await createClient();

  const [
    moRes,
    bikeRes,
    bikePartsRes,
    moRecipeCountRes,
    categoriesRes,
    catalogRes,
    kitsRes,
    kitMembershipsRes,
  ] = await Promise.all([
    supabase
      .from("manufacturing_orders")
      .select(
        `id, mo_number, status,
         bike_template:bike_templates(id, name_en, family:bike_families(name), frame_size),
         color:colors(name_en, name_da, hex),
         sales_order:sales_orders!sales_order_id(production_note)`,
      )
      .eq("id", moId)
      .maybeSingle(),
    supabase
      .from("bikes")
      .select(
        "id, frame_number, frame_number_confirmed, status, manufacturing_order_id, bike_type_id",
      )
      .eq("id", bikeId)
      .maybeSingle(),
    supabase
      .from("bike_parts")
      .select(
        `id, part_id, quantity, inventory_movement_id, notes,
         part:parts!part_id(
           id, internal_sku, name_en,
           default_retail_price, default_retail_currency,
           category:part_categories(id, name_en, name_da)
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
    supabase
      .from("kits")
      .select("id, sticker_color, kit_number")
      .eq("is_active", true)
      .order("sticker_color", { ascending: true })
      .order("kit_number", { ascending: true, nullsFirst: true }),
    supabase.from("part_kits").select("part_id, kit_id"),
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
      categoryName: r.part?.category
        ? localizedName(
            locale,
            r.part.category.name_en,
            r.part.category.name_da,
          )
        : null,
      quantity: Number(r.quantity),
      consumed: r.inventory_movement_id != null,
      notes: r.notes,
      onHand: stockByPart.get(r.part_id) ?? 0,
      retailDkk:
        r.part?.default_retail_price != null &&
        (r.part.default_retail_currency ?? "DKK") === "DKK"
          ? Number(r.part.default_retail_price)
          : null,
    }));

  const categories: CategoryOption[] = (categoriesRes.data ?? []).map((c) => ({
    id: c.id,
    name_en: c.name_en,
    name_da: c.name_da,
    sortOrder: c.sort_order,
  }));
  const catalog: PartInCatalog[] = (catalogRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
    category_id: p.category_id ?? null,
    onHand: stockByPart.get(p.id) ?? 0,
    retailDkk:
      p.default_retail_price != null &&
      (p.default_retail_currency ?? "DKK") === "DKK"
        ? Number(p.default_retail_price)
        : null,
  }));

  const recipeRowCount = moRecipeCountRes.count ?? 0;

  // kit_id → part_id[] for the workbench's "add / remove a whole kit" actions.
  const activeKitIds = new Set((kitsRes.data ?? []).map((k) => k.id));
  const kitParts: Record<string, string[]> = {};
  for (const m of kitMembershipsRes.data ?? []) {
    if (!activeKitIds.has(m.kit_id)) continue;
    (kitParts[m.kit_id] ??= []).push(m.part_id);
  }

  // ------- Pick list by kit -------
  // Group this bike's parts by their kit labels so the floor can pick by
  // sticker code ("Red 1 — whole kit, plus these loose parts"). A part with
  // several labels appears once, under its first kit (sorted by code) — the
  // remaining codes show as "also" hints so nothing gets double-picked.
  const bikePartIds = bikeParts.map((r) => r.partId);
  const pickGroups: PickGroup[] = [];
  let loosePicks: PickRow[] = bikeParts.map((r) => ({
    sku: r.partSku,
    name: r.partName,
    quantity: r.quantity,
    also: [],
  }));
  if (bikePartIds.length > 0) {
    const { data: memberships } = await supabase
      .from("part_kits")
      .select(
        "part_id, kit:kits!kit_id(id, sticker_color, kit_number, is_active)",
      )
      .in("part_id", bikePartIds);

    type KitRef = {
      id: string;
      sticker_color: string;
      kit_number: number | null;
    };
    const kitsByPart = new Map<string, KitRef[]>();
    const involvedKits = new Map<string, KitRef>();
    for (const m of memberships ?? []) {
      const kit = Array.isArray(m.kit) ? m.kit[0] : m.kit;
      if (!kit || !kit.is_active) continue;
      const ref: KitRef = {
        id: kit.id,
        sticker_color: kit.sticker_color,
        kit_number: kit.kit_number,
      };
      involvedKits.set(kit.id, ref);
      const list = kitsByPart.get(m.part_id) ?? [];
      list.push(ref);
      kitsByPart.set(m.part_id, list);
    }

    if (involvedKits.size > 0) {
      // Full membership of the involved kits (live parts only), to tell a
      // complete kit from a partial pick.
      const { data: fullMemberships } = await supabase
        .from("part_kits")
        .select("kit_id, part:parts!part_id(id, deleted_at)")
        .in("kit_id", [...involvedKits.keys()]);
      const kitTotalParts = new Map<string, Set<string>>();
      for (const m of fullMemberships ?? []) {
        const part = Array.isArray(m.part) ? m.part[0] : m.part;
        if (!part || part.deleted_at != null) continue;
        const set = kitTotalParts.get(m.kit_id) ?? new Set<string>();
        set.add(part.id);
        kitTotalParts.set(m.kit_id, set);
      }

      const sortedKits = [...involvedKits.values()].sort(compareKits);
      const bikePartIdSet = new Set(bikePartIds);
      const assigned = new Set<string>();

      for (const kit of sortedKits) {
        const rows: PickRow[] = [];
        for (const r of bikeParts) {
          if (assigned.has(r.partId)) continue;
          const labels = (kitsByPart.get(r.partId) ?? []).sort(compareKits);
          if (labels.length === 0 || labels[0].id !== kit.id) continue;
          assigned.add(r.partId);
          rows.push({
            sku: r.partSku,
            name: r.partName,
            quantity: r.quantity,
            also: labels.slice(1).map((l) => ({
              sticker_color: l.sticker_color,
              kit_number: l.kit_number,
            })),
          });
        }
        if (rows.length === 0) continue;
        const fullSet = kitTotalParts.get(kit.id) ?? new Set<string>();
        const presentFromKit = [...fullSet].filter((p) =>
          bikePartIdSet.has(p),
        ).length;
        pickGroups.push({
          sticker_color: kit.sticker_color,
          kit_number: kit.kit_number,
          complete: fullSet.size > 0 && presentFromKit === fullSet.size,
          totalKitParts: fullSet.size,
          presentKitParts: presentFromKit,
          rows,
        });
      }

      loosePicks = bikeParts
        .filter((r) => !assigned.has(r.partId))
        .map((r) => ({
          sku: r.partSku,
          name: r.partName,
          quantity: r.quantity,
          also: [],
        }));
    }
  }

  // Identifier context for the in-build "Frame & identifiers" panel. The frame
  // has its own dedicated confirm control, so the panel's "X / Y required"
  // hint counts only the OTHER required identifiers (excluding frame_number),
  // keeping it consistent with the filtered "Other identifiers" list.
  const identifierContext = await loadBikeIdentifierContext(
    supabase,
    bikeId,
    bike.bike_type_id,
  );

  // Paint gate (Tier 2 Phase C): block Finish while the frame is at the painter.
  const atPainterIds = await loadAtSupplierBikeIds(supabase, [bikeId]);
  const atPainterReason = atPainterIds.has(bikeId) ? t("atPainter") : null;
  const otherRequiredTypes = identifierContext.types.filter(
    (t) => t.is_required && t.slug !== "frame_number",
  );
  const otherRequiredCount = otherRequiredTypes.length;
  const otherRequiredRegisteredCount = otherRequiredTypes.filter(
    (t) => t.alreadyRegistered,
  ).length;

  const templateLabel = mo.bike_template
    ? [
        mo.bike_template.family?.name,
        mo.bike_template.frame_size,
        mo.bike_template.name_en,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  // Build-floor labeling note from the MO's sales order (Tier 2 Phase D).
  // `?? null` pins the type to `T | null` (the MO may have no sales order).
  const moSalesOrder =
    (Array.isArray(mo.sales_order) ? mo.sales_order[0] : mo.sales_order) ??
    null;
  const buildNote = moSalesOrder?.production_note ?? null;

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
              <Link href="/">{t("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/manufacturing-orders">{t("crumbMos")}</Link>
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
              {t("crumbBuild")}{" "}
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
        frameConfirmed={bike.frame_number_confirmed}
        atPainterReason={atPainterReason}
        buildNote={buildNote}
        bikeStatus={bikeStatus}
        templateLabel={templateLabel}
        colorName={
          mo.color
            ? localizedName(locale, mo.color.name_en, mo.color.name_da)
            : null
        }
        colorHex={mo.color?.hex ?? null}
        initialBikeParts={bikeParts}
        categories={categories}
        catalog={catalog}
        kits={kitsRes.data ?? []}
        kitParts={kitParts}
        moRecipeRowCount={recipeRowCount}
        identifierTypes={identifierContext.types}
        identifiers={identifierContext.rows}
        requiredIdentifierCount={otherRequiredCount}
        requiredRegisteredCount={otherRequiredRegisteredCount}
        readOnly={isReadOnly}
        pickListSlot={
          pickGroups.length > 0 ? (
            <PickList
              groups={pickGroups}
              loose={loosePicks}
              printHref={`/manufacturing-orders/${moId}/pick-list/print?n=1`}
            />
          ) : null
        }
      />
    </div>
  );
}
