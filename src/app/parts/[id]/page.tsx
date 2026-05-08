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
import { getStockStatus } from "@/lib/parts/stock";

import type { LocationOption } from "./_components/adjust-stock-dialog";
import { DetailsSection } from "./_components/details-section";
import { MovementsSection } from "./_components/movements-section";
import { OfferingsSection } from "./_components/offerings-section";
import { PartHeader } from "./_components/part-header";
import { PhotosSection } from "./_components/photos-section";
import type { PhotoRow } from "./_components/photo-thumb";
import { PricingHistorySection } from "./_components/pricing-history-section";
import { PurchaseHistorySection } from "./_components/purchase-history-section";
import { StatStrip } from "./_components/stat-strip";
import { StockSection } from "./_components/stock-section";

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
          category:part_categories(id, name_en)
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
          inventory_locations(id, code, name_en)
        `,
      )
      .eq("part_id", id),
    supabase
      .from("v_part_last_cost")
      .select("last_cost_dkk, last_purchase_quantity, last_order_date")
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
          inventory_locations(code, name_en)
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
          transport_factor,
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
      .select("id, code, name_en")
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
    supabase.from("currencies").select("code, name_en").order("code"),
    supabase
      .from("bike_template_parts")
      .select("template_id, bike_templates!inner(is_current)")
      .eq("part_id", id)
      .eq("bike_templates.is_current", true),
  ]);

  if (partRes.error) {
    throw new Error(`Failed to load part: ${partRes.error.message}`);
  }
  if (!partRes.data) {
    notFound();
  }

  const part = partRes.data;

  // ------- Stock per location -------
  const stockRows = (stockRes.data ?? []).map((row) => ({
    locationId: row.location_id ?? "",
    locationCode: row.inventory_locations?.code ?? "—",
    locationName: row.inventory_locations?.name_en ?? "—",
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    lastMovementAt: row.last_movement_at,
  }));
  const totalStock = stockRows.reduce(
    (sum, row) => sum + row.quantityOnHand,
    0,
  );

  // ------- Last cost + status -------
  const lastCostRow = lastCostRes.data ?? null;
  const lastCostDkk = lastCostRow ? Number(lastCostRow.last_cost_dkk) : null;
  const lastPurchaseQty = lastCostRow
    ? Number(lastCostRow.last_purchase_quantity)
    : null;
  const stockStatus = getStockStatus(
    totalStock,
    lastPurchaseQty,
    part.reorder_point != null ? Number(part.reorder_point) : null,
  );

  // ------- Where used: count of CURRENT template versions consuming this part
  const templateUsageCount = templatesUsageRes.data?.length ?? 0;

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
    locationName: row.inventory_locations?.name_en ?? "—",
    quantityDelta: Number(row.quantity_delta),
    unitCostDkk:
      row.unit_cost_dkk != null ? Number(row.unit_cost_dkk) : null,
    reason: row.reason,
    sourceEntityType: row.source_entity_type,
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
      transportFactor: Number(row.transport_factor),
      landedCostDkkPerUnit: Number(row.landed_cost_dkk_per_unit ?? 0),
    }))
    .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
    .slice(0, PURCHASE_LINES_LIMIT);

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
      name: row.name_en,
      currentOnHand: stockByLocation.get(row.id) ?? 0,
    }),
  );
  const activeLocationIds = new Set(locationOptions.map((l) => l.id));

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
              <Link href="/parts">Parts</Link>
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
        categoryName={part.category?.name_en ?? null}
        isDeleted={part.deleted_at != null}
        locations={locationOptions}
        heroUrl={heroPhoto?.fileUrl ?? null}
      />

      <StatStrip
        stockOnHand={totalStock}
        stockStatus={stockStatus}
        lastCostDkk={lastCostDkk}
        lastCostDate={lastCostRow?.last_order_date ?? null}
        supplierCount={offeringRows.length}
      />

      <PhotosSection partId={part.id} photos={photoRows} />

      <DetailsSection
        descriptionEn={part.description_en}
        descriptionDa={part.description_da}
        unitOfMeasure={part.unit_of_measure}
        weightGrams={part.weight_grams}
        defaultRetailPrice={
          part.default_retail_price != null
            ? Number(part.default_retail_price)
            : null
        }
        defaultRetailCurrency={part.default_retail_currency}
        reorderPoint={
          part.reorder_point != null ? Number(part.reorder_point) : null
        }
        reorderQuantity={
          part.reorder_quantity != null
            ? Number(part.reorder_quantity)
            : null
        }
        notes={part.notes}
        attributes={(part.attributes as Record<string, unknown>) ?? {}}
        templateUsageCount={templateUsageCount}
      />

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

      <StockSection
        rows={stockRows}
        partId={part.id}
        partName={part.name_en}
        locations={locationOptions}
        activeLocationIds={activeLocationIds}
      />

      <MovementsSection rows={movementRows} />

      <PurchaseHistorySection rows={purchaseRows} />

      <PricingHistorySection rows={pricingRows} />
    </div>
  );
}
