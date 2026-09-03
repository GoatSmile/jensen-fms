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
import { readAllowedCaps } from "@/lib/auth/read-session";
import {
  PAINT_SERVICE_SLUG,
  loadServiceTypeBySlug,
} from "@/lib/services/vocab";
import type { ServicePriceItem } from "@/lib/services/pricing";
import { localizedName } from "@/i18n/vocab";
import { lookupDkkRate } from "@/lib/format";
import { getStockStatus } from "@/lib/parts/stock";
import { compareKits } from "@/lib/kits/colors";

import type { LocationOption } from "./_components/adjust-stock-dialog";
import { DetailsSection } from "./_components/details-section";
import {
  KitsSection,
  type KitOption,
  type PartKitChip,
} from "./_components/kits-section";
import { MovementsSection } from "./_components/movements-section";
import { OfferingsSection } from "./_components/offerings-section";
import { PartHeader } from "./_components/part-header";
import { PhotosSection } from "./_components/photos-section";
import type { PhotoRow } from "./_components/photo-thumb";
import { PricingHistorySection } from "./_components/pricing-history-section";
import { PurchaseHistorySection } from "./_components/purchase-history-section";
import { WhereUsedSection } from "./_components/where-used-section";
import { StatStrip } from "./_components/stat-strip";
import { StockSection } from "./_components/stock-section";
import {
  PaintedVariantsSection,
  type PaintedVariantRow,
} from "./_components/painted-variants-section";
import type { ColourChoice } from "./_components/record-painted-stock-dialog";
import { colorFinishLabel } from "@/lib/colors/coating";

const MOVEMENTS_LIMIT = 50;
const PURCHASE_LINES_LIMIT = 10;
// We over-fetch lines so we can sort them by the *parent PO's* order_date
// client-side. PostgREST can order an embedded resource but not the outer
// table by an embedded column, so this is the cleanest approximation without
// a dedicated view.
const PURCHASE_LINES_FETCH = PURCHASE_LINES_LIMIT * 3;

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tParts, tCommon, locale] = await Promise.all([
    getTranslations("parts"),
    getTranslations("common"),
    getLocale(),
  ]);
  const supabase = await createClient();

  const [
    partRes,
    offeringsRes,
    stockRes,
    lastCostRes,
    movementsRes,
    purchaseLinesRes,
    pricingRes,
    locationsRes,
    attachmentsRes,
    suppliersRes,
    currenciesRes,
    templatesUsageRes,
    moUsageRes,
    bikePartsUsageRes,
    fxRatesRes,
    partKitsRes,
    kitOptionsRes,
    settingsRes,
  ] = await Promise.all([
    supabase
      .from("parts")
      .select(
        `
          id,
          internal_sku,
          name_en,
          name_da,
          description_en,
          description_da,
          unit_of_measure,
          default_retail_price,
          default_retail_currency,
          weight_grams,
          reorder_point,
          reorder_quantity,
          notes,
          attributes,
          deleted_at,
          base_part_id,
          color_id,
          service_part_type_id,
          paintable_as:service_part_types!service_part_type_id(name_en, name_da),
          own_colour:colors!color_id(name_en, name_da, hex),
          category:part_categories(id, name_en, name_da),
          hs_code:hs_codes!hs_code_id(id, code, description, tariff_pct, is_active)
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("part_supplier_offerings")
      .select(
        `
          id,
          supplier_id,
          supplier_sku,
          default_purchase_price,
          default_purchase_currency,
          minimum_order_quantity,
          lead_time_days,
          is_preferred,
          notes,
          suppliers(id, name)
        `,
      )
      .eq("part_id", id)
      .order("is_preferred", { ascending: false }),
    supabase
      .from("v_current_stock")
      .select(
        `
          part_id,
          location_id,
          quantity_on_hand,
          last_movement_at,
          inventory_locations(id, code, name_en, name_da)
        `,
      )
      .eq("part_id", id),
    supabase
      .from("v_part_last_cost")
      .select(
        "last_cost_dkk, last_purchase_quantity, last_order_date, last_cost_basis, last_cost_at",
      )
      .eq("part_id", id)
      .maybeSingle(),
    supabase
      .from("inventory_movements")
      .select(
        `
          id,
          occurred_at,
          movement_type,
          quantity_delta,
          unit_cost_dkk,
          reason,
          source_entity_type,
          created_by,
          inventory_locations(code, name_en, name_da),
          moved_by:people!inventory_movements_created_by_fkey(full_name)
        `,
      )
      .eq("part_id", id)
      .order("occurred_at", { ascending: false })
      .limit(MOVEMENTS_LIMIT),
    supabase
      .from("purchase_order_lines")
      .select(
        `
          id,
          quantity,
          received_quantity,
          unit_price,
          currency,
          fx_rate_to_dkk,
          transport_pct,
          tariff_pct,
          anti_dumping_pct,
          landed_cost_dkk_per_unit,
          purchase_orders(id, po_number, order_date)
        `,
      )
      .eq("part_id", id)
      .order("created_at", { ascending: false })
      .limit(PURCHASE_LINES_FETCH),
    supabase
      .from("part_retail_prices")
      .select("id, price, currency, effective_from, effective_to")
      .eq("part_id", id)
      .order("effective_from", { ascending: false }),
    supabase
      .from("inventory_locations")
      .select("id, code, name_en, name_da")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("attachments")
      .select("id, file_url, file_name, purpose, created_at")
      .eq("entity_type", "part")
      .eq("entity_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("suppliers")
      .select("id, name, default_currency")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("currencies")
      .select("code, name_en")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    supabase
      .from("bike_template_parts")
      .select(
        `
          template_id, quantity,
          bike_templates!inner(
            id, name_en, family:bike_families(name), frame_size, version, is_current,
            bike_type:bike_types(id, name_en, name_da)
          )
        `,
      )
      .eq("part_id", id)
      .eq("bike_templates.is_current", true),
    supabase
      .from("manufacturing_order_parts")
      .select(
        `
          quantity_per_bike,
          manufacturing_orders!inner(
            id, mo_number, status, target_quantity, completed_quantity
          )
        `,
      )
      .eq("part_id", id)
      .in("manufacturing_orders.status", [
        "planned",
        "released",
        "in_progress",
        "on_hold",
      ]),
    supabase
      .from("bike_parts")
      .select("bike_id, removed_at")
      .eq("part_id", id)
      .is("removed_at", null),
    supabase
      .from("fx_rates")
      .select("from_currency, rate, rate_date")
      .eq("to_currency", "DKK")
      .order("rate_date", { ascending: false }),
    supabase
      .from("part_kits")
      .select("kit:kits!kit_id(id, sticker_color, kit_number, is_active)")
      .eq("part_id", id),
    supabase
      .from("kits")
      .select("id, sticker_color, kit_number")
      .eq("is_active", true)
      .order("sticker_color", { ascending: true })
      .order("kit_number", { ascending: true, nullsFirst: true }),
    supabase
      .from("app_settings")
      .select("hide_location_info, primary_location_id")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const hideLocations = settingsRes.data?.hide_location_info ?? false;
  const primaryLocationId = settingsRes.data?.primary_location_id ?? null;

  if (partRes.error) {
    throw new Error(`Failed to load part: ${partRes.error.message}`);
  }
  if (!partRes.data) {
    notFound();
  }

  const part = partRes.data;

  // ------- Painted variants (docs/plan-painted-parts.md) -------
  // A raw part lists its painted variants with on-hand per colour; a variant
  // points back at its base. Self-join embeds are direction-ambiguous on
  // PostgREST, so both sides are explicit queries.
  const [variantsRes, baseRes] = await Promise.all([
    supabase
      .from("parts")
      .select("id, internal_sku, color_id, color:colors!color_id(name_en, name_da, hex, ral_code, coating)")
      .eq("base_part_id", part.id)
      .is("deleted_at", null),
    part.base_part_id
      ? supabase
          .from("parts")
          .select("id, internal_sku, name_en, color:colors!color_id(name_en, name_da, hex)")
          .eq("id", part.base_part_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const variantIds = (variantsRes.data ?? []).map((v) => v.id);
  // Colours already on the shelf for this part — the record dialog flags them
  // so "3 more in Red" is visibly topping up rather than starting a colour.
  const variantColourIds = (variantsRes.data ?? [])
    .map((v) => v.color_id)
    .filter((x): x is string => typeof x === "string");
  const variantStock = new Map<string, number>();
  const variantLastMovement = new Map<string, string>();
  // Per LOCATION too, not just the total: the adjust dialog's `currentOnHand`
  // drives "Currently N on hand", the resulting-quantity preview AND the delta
  // that "Set on-hand to…" writes. Hand it the base part's figure and a
  // "set to 13" on a variant writes 13 − 89 = −76.
  const variantStockByLocation = new Map<string, Map<string, number>>();
  // Each variant's OWN prevailing cost (raw + the frozen paint price), so its
  // adjust dialog pre-fills its own figure and not the base part's raw one.
  // Two batched queries, never one per row.
  const variantCost = new Map<string, number>();
  if (variantIds.length > 0) {
    const [{ data: vs }, { data: vc }] = await Promise.all([
      supabase
        .from("v_current_stock")
        .select("part_id, location_id, quantity_on_hand, last_movement_at")
        .in("part_id", variantIds),
      supabase
        .from("v_part_last_cost")
        .select("part_id, last_cost_dkk")
        .in("part_id", variantIds),
    ]);
    for (const r of vs ?? []) {
      if (!r.part_id) continue;
      variantStock.set(r.part_id, (variantStock.get(r.part_id) ?? 0) + Number(r.quantity_on_hand ?? 0));
      if (r.location_id) {
        const byLoc = variantStockByLocation.get(r.part_id) ?? new Map();
        byLoc.set(r.location_id, Number(r.quantity_on_hand ?? 0));
        variantStockByLocation.set(r.part_id, byLoc);
      }
      // v_current_stock is PER LOCATION, so keep the newest across rows.
      const prev = variantLastMovement.get(r.part_id);
      if (r.last_movement_at && (!prev || r.last_movement_at > prev)) {
        variantLastMovement.set(r.part_id, r.last_movement_at);
      }
    }
    for (const r of vc ?? []) {
      if (!r.part_id || r.last_cost_dkk == null) continue;
      variantCost.set(r.part_id, Number(r.last_cost_dkk));
    }
  }
  const variantRows = (variantsRes.data ?? [])
    .map((v) => ({
      partId: v.id,
      sku: v.internal_sku,
      colourName: v.color ? localizedName(locale, v.color.name_en, v.color.name_da) : "—",
      colourHex: v.color?.hex ?? null,
      colourFinish: v.color
        ? colorFinishLabel(v.color.ral_code, v.color.coating, locale === "da" ? "da" : "en")
        : null,
      onHand: variantStock.get(v.id) ?? 0,
      lastMovementAt: variantLastMovement.get(v.id) ?? null,
      prevailingCostDkk: variantCost.get(v.id) ?? null,
    }))
    .sort((a, b) => b.onHand - a.onHand || a.colourName.localeCompare(b.colourName));
  // On a variant, the banner names the base and THIS part's own colour.
  const baseRow = baseRes.data
    ? {
        partId: baseRes.data.id,
        sku: baseRes.data.internal_sku,
        name: baseRes.data.name_en,
        colourName: part.own_colour
          ? localizedName(locale, part.own_colour.name_en, part.own_colour.name_da)
          : "—",
        colourHex: part.own_colour?.hex ?? null,
      }
    : null;
  const paintableAs = part.paintable_as
    ? localizedName(locale, part.paintable_as.name_en, part.paintable_as.name_da)
    : null;

  // ------- Stock per location -------
  const stockRows = (stockRes.data ?? []).map((row) => ({
    locationId: row.location_id ?? "",
    locationCode: row.inventory_locations?.code ?? "—",
    locationName:
      localizedName(
        locale,
        row.inventory_locations?.name_en,
        row.inventory_locations?.name_da,
      ) || "—",
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    lastMovementAt: row.last_movement_at,
  }));
  const totalStock = stockRows.reduce(
    (sum, row) => sum + row.quantityOnHand,
    0,
  );

  // ------- Last cost + status -------
  const lastCostRow = lastCostRes.data ?? null;
  // Null-check the FIELDS, not just the row: since migration 88 the view is a
  // FULL OUTER JOIN of "last costed event" and "last purchase", so either half
  // can be absent on a row that exists. `Number(null)` is 0, which would render
  // a confident 0,00 kr. where the honest answer is "not known yet".
  const lastCostDkk =
    lastCostRow?.last_cost_dkk != null ? Number(lastCostRow.last_cost_dkk) : null;
  const lastCostBasis = lastCostRow?.last_cost_basis ?? null;
  const lastPurchaseQty =
    lastCostRow?.last_purchase_quantity != null
      ? Number(lastCostRow.last_purchase_quantity)
      : null;
  const stockStatus = getStockStatus(
    totalStock,
    lastPurchaseQty,
    part.reorder_point != null ? Number(part.reorder_point) : null,
  );

  // ------- Where used: count of CURRENT template versions consuming this part
  const templateUsageCount = templatesUsageRes.data?.length ?? 0;

  // Detailed where-used: templates, open MOs, currently-installed bike count.
  const templateUsageRows = (templatesUsageRes.data ?? [])
    .map((r) => ({
      templateId: r.bike_templates?.id ?? "",
      templateName: r.bike_templates?.name_en ?? "—",
      templateVersion: r.bike_templates?.version ?? 0,
      family: r.bike_templates?.family?.name ?? null,
      frameSize: r.bike_templates?.frame_size ?? "",
      bikeTypeName: r.bike_templates?.bike_type
        ? localizedName(
            locale,
            r.bike_templates.bike_type.name_en,
            r.bike_templates.bike_type.name_da,
          )
        : null,
      qtyPerBike: Number(r.quantity),
    }))
    .filter((t) => t.templateId !== "");

  const moUsageRows = (moUsageRes.data ?? [])
    .map((r) => {
      const mo = r.manufacturing_orders;
      const target = Number(mo?.target_quantity ?? 0);
      const completed = Number(mo?.completed_quantity ?? 0);
      return {
        moId: mo?.id ?? "",
        moNumber: mo?.mo_number ?? "—",
        status: (mo?.status ?? "planned") as
          "planned" | "released" | "in_progress" | "on_hold",
        qtyPerBike: Number(r.quantity_per_bike),
        outstandingBikes: Math.max(0, target - completed),
      };
    })
    .filter((m) => m.moId !== "");

  const installedBikeIds = new Set(
    (bikePartsUsageRes.data ?? []).map((r) => r.bike_id),
  );
  const installedBikeCount = installedBikeIds.size;

  // ------- FX rates (latest per from_currency, → DKK) -------
  // Used to render foreign-currency offerings with a DKK ≈ tail.
  const fxToDkk = new Map<string, number>();
  for (const row of fxRatesRes.data ?? []) {
    if (!fxToDkk.has(row.from_currency)) {
      fxToDkk.set(row.from_currency, Number(row.rate));
    }
  }

  // ------- Offerings -------
  const offeringRows = (offeringsRes.data ?? []).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.name ?? "—",
    supplierSku: row.supplier_sku,
    defaultPurchasePrice:
      row.default_purchase_price != null
        ? Number(row.default_purchase_price)
        : null,
    defaultPurchaseCurrency: row.default_purchase_currency,
    fxRateToDkk: lookupDkkRate(fxToDkk, row.default_purchase_currency),
    minimumOrderQuantity:
      row.minimum_order_quantity != null
        ? Number(row.minimum_order_quantity)
        : null,
    leadTimeDays: row.lead_time_days,
    isPreferred: row.is_preferred,
    notes: row.notes,
  }));

  // ------- Movements -------
  const movementRows = (movementsRes.data ?? []).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    movementType: row.movement_type,
    locationCode: row.inventory_locations?.code ?? "—",
    locationName:
      localizedName(
        locale,
        row.inventory_locations?.name_en,
        row.inventory_locations?.name_da,
      ) || "—",
    quantityDelta: Number(row.quantity_delta),
    unitCostDkk: row.unit_cost_dkk != null ? Number(row.unit_cost_dkk) : null,
    reason: row.reason,
    sourceEntityType: row.source_entity_type,
    movedByName:
      (Array.isArray(row.moved_by) ? row.moved_by[0] : row.moved_by)
        ?.full_name ?? null,
  }));

  // ------- Purchase lines (sorted by PO order_date desc, top N) -------
  const purchaseRows = (purchaseLinesRes.data ?? [])
    .map((row) => ({
      id: row.id,
      poId: row.purchase_orders?.id ?? "",
      poNumber: row.purchase_orders?.po_number ?? "—",
      orderDate: row.purchase_orders?.order_date ?? "",
      quantity: Number(row.quantity),
      receivedQuantity: Number(row.received_quantity),
      unitPrice: Number(row.unit_price),
      currency: row.currency,
      fxRateToDkk: Number(row.fx_rate_to_dkk),
      transportPct: Number(row.transport_pct),
      tariffPct: Number(row.tariff_pct ?? 0),
      antiDumpingPct: Number(row.anti_dumping_pct ?? 0),
      landedCostDkkPerUnit: Number(row.landed_cost_dkk_per_unit ?? 0),
    }))
    .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
    .slice(0, PURCHASE_LINES_LIMIT);

  // ------- Kit labels on this part + active kits for the add-picker -------
  const kitChips: PartKitChip[] = (partKitsRes.data ?? [])
    .map((row) => (Array.isArray(row.kit) ? row.kit[0] : row.kit))
    .filter((k): k is NonNullable<typeof k> => k != null)
    .map((k) => ({
      kitId: k.id,
      sticker_color: k.sticker_color,
      kit_number: k.kit_number,
      is_active: k.is_active,
    }))
    .sort(compareKits);
  const kitOptions: KitOption[] = kitOptionsRes.data ?? [];

  // ------- Photos: hero first, then gallery (most recent first) -------
  const photoRows: PhotoRow[] = (attachmentsRes.data ?? [])
    .map((row) => ({
      id: row.id,
      fileUrl: row.file_url,
      fileName: row.file_name,
      purpose: row.purpose ?? "gallery",
    }))
    .sort((a, b) => {
      if (a.purpose === b.purpose) return 0;
      return a.purpose === "hero" ? -1 : 1;
    });
  const heroPhoto = photoRows.find((p) => p.purpose === "hero") ?? null;

  // ------- Active locations enriched with current on-hand -------
  // The dialog needs every active location, not just the ones with prior
  // movement; otherwise you can't initialise stock at a fresh location.
  const stockByLocation = new Map(
    stockRows.map((row) => [row.locationId, row.quantityOnHand]),
  );
  const locationOptions: LocationOption[] = (locationsRes.data ?? []).map(
    (row) => ({
      id: row.id,
      code: row.code,
      name: localizedName(locale, row.name_en, row.name_da),
      currentOnHand: stockByLocation.get(row.id) ?? 0,
    }),
  );
  const activeLocationIds = new Set(locationOptions.map((l) => l.id));

  // ------- "Record painted stock": colour vocab + a cost to pre-fill -------
  // Only a RAW, paintable part can take painted stock by hand; on a variant or
  // an unmarked part the panel carries no action.
  const canRecordPainted = !part.base_part_id && !!part.service_part_type_id;
  let colourChoices: ColourChoice[] = [];
  let paintPriceItems: ServicePriceItem[] = [];
  let paintPriceListLabel: string | null = null;
  let mayCreateColour = false;
  if (canRecordPainted) {
    const caps = await readAllowedCaps();
    // null = the gate is off entirely (local dev), so nothing is scoped.
    mayCreateColour = caps === null || caps.includes("admin");

    const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
    const [coloursRes, listRes] = await Promise.all([
      supabase
        .from("colors")
        .select("id, name_en, name_da, hex, ral_code, coating")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      serviceType?.default_supplier_id
        ? supabase
            .from("service_price_lists")
            .select(
              `name, currency, supplier:suppliers(name),
               items:service_price_items(
                 id, service_part_type_id, supplier_item_no, tier_min, tier_max, unit_price
               )`,
            )
            .eq("service_type_id", serviceType.id)
            .eq("supplier_id", serviceType.default_supplier_id)
            .eq("is_current", true)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    colourChoices = coloursRes.data ?? [];
    const list = listRes.data;
    // DKK only: the pre-filled figure is added to a DKK raw cost, and mixing
    // currencies into one number is how a wrong cost basis gets written. A
    // non-DKK painter simply contributes no paint half.
    if (list && list.currency === "DKK") {
      paintPriceItems = (list.items ?? [])
        .filter((i) => i.service_part_type_id === part.service_part_type_id)
        .map((i) => ({
          id: i.id,
          service_part_type_id: i.service_part_type_id,
          supplier_item_no: i.supplier_item_no,
          tier_min: i.tier_min,
          tier_max: i.tier_max,
          unit_price: Number(i.unit_price),
        }));
      paintPriceListLabel = [list.name, one(list.supplier)?.name]
        .filter(Boolean)
        .join(" · ");
    }
  }

  // Painted-stock rows, each carrying ITS OWN per-location on-hand for the
  // dialog. Built here rather than with `variantRows` above because it needs
  // the active-location list, which is resolved further down the page.
  const paintedVariantRows: PaintedVariantRow[] = variantRows.map((v) => ({
    ...v,
    locations: (locationsRes.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: localizedName(locale, row.name_en, row.name_da),
      currentOnHand: variantStockByLocation.get(v.partId)?.get(row.id) ?? 0,
    })),
  }));

  // ------- Pricing history with current-row flag -------
  // Server component runs once per request — a single wall-clock read here
  // is exactly what we want. The react-hooks purity rule can't tell a server
  // render from a re-rendering client component, so we silence it locally.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const pricingRows = (pricingRes.data ?? []).map((row) => {
    const from = new Date(row.effective_from).getTime();
    const to = row.effective_to ? new Date(row.effective_to).getTime() : null;
    const isCurrent = from <= now && (to === null || now < to);
    return {
      id: row.id,
      price: Number(row.price),
      currency: row.currency,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      isCurrent,
    };
  });

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
              <Link href="/parts">{tParts("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{part.internal_sku}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PartHeader
        partId={part.id}
        internalSku={part.internal_sku}
        nameEn={part.name_en}
        nameDa={part.name_da}
        categoryName={
          part.category
            ? localizedName(
                locale,
                part.category.name_en,
                part.category.name_da,
              )
            : null
        }
        isDeleted={part.deleted_at != null}
        locations={locationOptions}
        hideLocations={hideLocations}
        primaryLocationId={primaryLocationId}
        prevailingCostDkk={lastCostDkk}
        heroUrl={heroPhoto?.fileUrl ?? null}
        currencies={currenciesRes.data ?? []}
      />

      <StatStrip
        stockOnHand={totalStock}
        stockStatus={stockStatus}
        lastCostDkk={lastCostDkk}
        retailPrice={
          part.default_retail_price != null
            ? Number(part.default_retail_price)
            : null
        }
        retailCurrency={part.default_retail_currency}
        supplierCount={offeringRows.length}
      />

      <PhotosSection partId={part.id} photos={photoRows} />

      <DetailsSection
        descriptionEn={part.description_en}
        descriptionDa={part.description_da}
        unitOfMeasure={part.unit_of_measure}
        weightGrams={part.weight_grams}
        lastCostDkk={lastCostDkk}
        lastCostBasis={lastCostBasis}
        // The as-of date follows the cost itself. `last_order_date` is
        // purchase-only, so a hand-priced part would otherwise show a figure
        // with no date at all.
        lastCostDate={
          lastCostRow?.last_cost_at ?? lastCostRow?.last_order_date ?? null
        }
        reorderPoint={
          part.reorder_point != null ? Number(part.reorder_point) : null
        }
        reorderQuantity={
          part.reorder_quantity != null ? Number(part.reorder_quantity) : null
        }
        notes={part.notes}
        attributes={(part.attributes as Record<string, unknown>) ?? {}}
        templateUsageCount={templateUsageCount}
      />

      <KitsSection partId={part.id} chips={kitChips} options={kitOptions} />

      <PaintedVariantsSection
        currencies={currenciesRes.data ?? []}
        primaryLocationId={primaryLocationId}
        hideLocations={hideLocations}
        record={
          canRecordPainted
            ? {
                basePartId: part.id,
                basePartSku: part.internal_sku,
                locations: locationOptions,
                primaryLocationId,
                hideLocations,
                colours: colourChoices,
                existingVariantColourIds: variantColourIds,
                rawCostDkk: lastCostDkk,
                paintPriceItems,
                paintPartTypeId: part.service_part_type_id,
                paintPriceListLabel,
                mayCreateColour,
              }
            : null
        }
        paintableAs={paintableAs}
        variants={paintedVariantRows}
        base={baseRow}
      />

      {/* Section order tells a story: identity (neutral) → availability
          (sky) → sourcing (amber) → usage/selling (neutral tail). */}
      <StockSection
        hasPaintedVariants={variantRows.length > 0}
        rows={stockRows}
        partId={part.id}
        partName={part.name_en}
        locations={locationOptions}
        activeLocationIds={activeLocationIds}
        hideLocations={hideLocations}
        primaryLocationId={primaryLocationId}
        currencies={currenciesRes.data ?? []}
        prevailingCostDkk={lastCostDkk}
      />

      <MovementsSection rows={movementRows} hideLocations={hideLocations} />

      <OfferingsSection
        partId={part.id}
        rows={offeringRows}
        suppliers={(suppliersRes.data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          defaultCurrency: s.default_currency,
        }))}
        currencies={currenciesRes.data ?? []}
      />

      <PurchaseHistorySection
        rows={purchaseRows}
        internalSku={part.internal_sku}
        hsCode={
          part.hs_code && part.hs_code.is_active ? part.hs_code.code : null
        }
      />

      <WhereUsedSection
        partId={part.id}
        templates={templateUsageRows}
        mos={moUsageRows}
        installedBikeCount={installedBikeCount}
      />

      <PricingHistorySection rows={pricingRows} />
    </div>
  );
}
