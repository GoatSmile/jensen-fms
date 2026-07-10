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
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import type { BikeStatus } from "@/lib/bikes/status";
import { OPEN_SERVICE_ORDER_STATUSES } from "@/lib/services/status";
import type {
  ColorOption,
  SupplierOption,
} from "@/app/paint-orders/_components/paint-order-form";

import {
  PaintFromSOForm,
  type EligibleSOBike,
} from "./_components/paint-from-so-form";

const METACOAT_NAME = "Metacoat A/S";

export default async function PaintFromSOPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
           color:colors(name_en, hex),
           template:bike_templates(family:bike_families(name), frame_size, name_en)`,
        )
        .in("manufacturing_order_id", moIds)
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
          (r) =>
            one(one(r.service_order)?.service_type)?.blocks_build === true,
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
          colorName: b.color?.name_en ?? null,
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
      .select("id, name_en, hex, ral_code, coating")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const suppliers: SupplierOption[] = suppliersRes.data ?? [];
  const colors: ColorOption[] = colorsRes.data ?? [];
  const metacoat = suppliers.find((s) => s.name === METACOAT_NAME);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/sales-orders">Sales orders</Link>
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
            <BreadcrumbPage>Paint frames</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Paint frames from {so.sales_order_number}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pick the frames to send to the painter as one batch. The paint order
          links back to this sales order.
        </p>
      </div>

      {blocked ? (
        <div className="bg-muted/30 flex flex-col items-center gap-2 rounded-md border p-8 text-center">
          <p className="text-sm font-medium">
            Can&apos;t paint a {so.status} sales order
          </p>
          <p className="text-muted-foreground text-xs">
            Paint orders are part of the build pipeline, so they can only be
            created while the SO is still in production.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href={`/sales-orders/${so.id}`}>Back to sales order</Link>
          </Button>
        </div>
      ) : (
        <PaintFromSOForm
          soId={so.id}
          soNumber={so.sales_order_number}
          eligibleBikes={eligibleBikes}
          suppliers={suppliers}
          colors={colors}
          defaultSupplierId={metacoat?.id ?? ""}
        />
      )}
    </div>
  );
}
