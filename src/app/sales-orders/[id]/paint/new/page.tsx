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
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import { localizedName } from "@/i18n/vocab";
import type { BikeStatus } from "@/lib/bikes/status";
import { OPEN_SERVICE_ORDER_STATUSES } from "@/lib/services/status";
import {
  PAINT_SERVICE_SLUG,
  loadServiceTypeBySlug,
} from "@/lib/services/vocab";
import type {
  ColorOption,
  SupplierOption,
} from "@/app/paint-orders/_components/paint-order-form";

import {
  PaintFromSOForm,
  type EligibleSOBike,
} from "./_components/paint-from-so-form";

export default async function PaintFromSOPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tSo, tSoStatus, tCommon, locale] = await Promise.all([
    getTranslations("soDetail"),
    getTranslations("so"),
    getTranslations("soStatus"),
    getTranslations("common"),
    getLocale(),
  ]);
  const supabase = await createClient();

  const { data: so, error } = await supabase
    .from("sales_orders")
    .select("id, sales_order_number, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load SO: ${error.message}`);
  if (!so) notFound();

  const blocked = so.status === "cancelled" || so.status === "delivered";

  // Resolve the SO's frames: SO → MOs → bikes.
  const { data: mos } = await supabase
    .from("manufacturing_orders")
    .select("id")
    .eq("sales_order_id", id);
  const moIds = (mos ?? []).map((m) => m.id);

  let eligibleBikes: EligibleSOBike[] = [];
  if (!blocked && moIds.length > 0) {
    const [bikesRes, openLinksRes] = await Promise.all([
      supabase
        .from("bikes")
        .select(
          `id, frame_number, status,
           color:colors(id, name_en, name_da, hex),
           template:bike_templates(family:bike_families(name), frame_size, name_en)`,
        )
        .in("manufacturing_order_id", moIds)
        .in("status", ["planning", "building"])
        .is("deleted_at", null)
        .order("frame_number", { ascending: true }),
      // Same eligibility the createPaintOrderFromSO action enforces: a frame
      // is unavailable while it sits on an OPEN order of a build-blocking
      // service type (a non-blocking type wouldn't take the bike away).
      supabase
        .from("service_order_bikes")
        .select(
          `bike_id,
           service_order:service_orders!inner(
             status,
             service_type:service_types!service_type_id(blocks_build)
           )`,
        )
        .in("service_order.status", OPEN_SERVICE_ORDER_STATUSES),
    ]);

    const inOpenOrder = new Set(
      (openLinksRes.data ?? [])
        .filter(
          (r) => one(one(r.service_order)?.service_type)?.blocks_build === true,
        )
        .map((r) => r.bike_id),
    );
    eligibleBikes = (bikesRes.data ?? [])
      .filter((b) => !inOpenOrder.has(b.id))
      .map((b) => {
        const tpl = b.template;
        return {
          id: b.id,
          frameNumber: b.frame_number,
          status: b.status as BikeStatus,
          colorId: b.color?.id ?? null,
          colorName: b.color
            ? localizedName(locale, b.color.name_en, b.color.name_da)
            : null,
          colorHex: b.color?.hex ?? null,
          templateLabel: tpl
            ? [tpl.family?.name, tpl.frame_size, tpl.name_en]
                .filter(Boolean)
                .join(" · ")
            : null,
        };
      });
  }

  // Option lists for the header (same sources as /paint-orders/new).
  const [suppliersRes, colorsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("colors")
      .select("id, name_en, name_da, hex, ral_code, coating")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const suppliers: SupplierOption[] = suppliersRes.data ?? [];
  const colors: ColorOption[] = colorsRes.data ?? [];

  // Pre-select the colour when the frames agree on one — they came off a
  // sales order line that named it, and the screen that sent you here already
  // said "no painted stock in White". Frames in two colours have no single
  // right answer for a batch default, so leave it blank rather than guess.
  const distinctColourIds = [
    ...new Set(
      eligibleBikes
        .map((b) => b.colorId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const defaultColorId =
    distinctColourIds.length === 1 ? distinctColourIds[0] : "";
  // Pre-select the painting type's configured default supplier, if it's still
  // an active supplier in the picker.
  const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
  const defaultSupplierId =
    serviceType?.default_supplier_id &&
    suppliers.some((s) => s.id === serviceType.default_supplier_id)
      ? serviceType.default_supplier_id
      : "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/sales-orders">{tSo("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/sales-orders/${so.id}`} className="font-mono">
                {so.sales_order_number}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbPaintFrames")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("paintFramesTitle", { so: so.sales_order_number })}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("paintFramesSubtitle")}
        </p>
      </div>

      {blocked ? (
        <div className="bg-muted/30 flex flex-col items-center gap-2 rounded-md border p-8 text-center">
          <p className="text-sm font-medium">
            {t("cantPaintStatus", {
              status: tSoStatus.has(so.status)
                ? tSoStatus(so.status)
                : so.status,
            })}
          </p>
          <p className="text-muted-foreground text-xs">{t("cantPaintDesc")}</p>
          <Button asChild variant="outline" className="mt-2">
            <Link href={`/sales-orders/${so.id}`}>{t("backToSo")}</Link>
          </Button>
        </div>
      ) : (
        <PaintFromSOForm
          soId={so.id}
          soNumber={so.sales_order_number}
          eligibleBikes={eligibleBikes}
          suppliers={suppliers}
          colors={colors}
          defaultSupplierId={defaultSupplierId}
          defaultColorId={defaultColorId}
        />
      )}
    </div>
  );
}
