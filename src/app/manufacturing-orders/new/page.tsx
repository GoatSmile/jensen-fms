import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";

import {
  EMPTY_MO_FORM,
  MOForm,
  ONE_OFF_VALUE,
  type BikeTypeOption,
  type ColorOption,
  type TemplateOption,
} from "../_components/mo-form";
import { MOBatchForm } from "../_components/mo-batch-form";

type SearchParams = {
  template?: string;
  /** "oneoff" switches to the single-MO form for template-less builds. */
  mode?: string;
};

export default async function NewManufacturingOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [templatesRes, bikeTypesRes, colorsRes, bomsRes] = await Promise.all([
    supabase
      .from("bike_templates")
      .select(
        `
          id, name_en, family_id, family:bike_families(name, sort_order),
          frame_size, version, is_current, bike_type_id,
          bike_type:bike_types(name_en)
        `,
      )
      .eq("is_current", true)
      .order("frame_size", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("bike_types")
      .select("id, slug, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("colors")
      .select("id, slug, name_da, name_en, hex")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    // Every current template's BOM, for the live coverage preview. The
    // copy-RPC takes all rows (optional included), so the preview does too.
    supabase
      .from("bike_template_parts")
      .select(
        `template_id, part_id, quantity,
         part:parts!part_id(internal_sku, name_en),
         template:bike_templates!template_id(is_current)`,
      ),
  ]);

  if (templatesRes.error) {
    throw new Error(`Failed to load templates: ${templatesRes.error.message}`);
  }

  const templates: TemplateOption[] = (templatesRes.data ?? [])
    .map((t) => ({
      id: t.id,
      name_en: t.name_en,
      family: t.family?.name ?? null,
      family_id: t.family_id ?? null,
      family_sort: t.family?.sort_order ?? null,
      frame_size: t.frame_size,
      version: t.version,
      is_current: t.is_current,
      bike_type_id: t.bike_type_id,
      bike_type_name: t.bike_type?.name_en ?? null,
    }))
    // Family-adjacent ordering everywhere the list feeds (batch cards +
    // one-off select): families by their admin sort_order, then no-family
    // templates alphabetically, sizes within.
    .sort(
      (a, b) =>
        (a.family_sort ?? Number.MAX_SAFE_INTEGER) -
          (b.family_sort ?? Number.MAX_SAFE_INTEGER) ||
        (a.family ?? a.name_en).localeCompare(b.family ?? b.name_en) ||
        a.frame_size.localeCompare(b.frame_size, undefined, {
          numeric: true,
        }) ||
        a.name_en.localeCompare(b.name_en),
    );
  const typeRows = bikeTypesRes.data ?? [];
  const bikeTypes: BikeTypeOption[] = typeRows.map(({ id, name_en }) => ({
    id,
    name_en,
  }));
  const defaultBikeTypeId =
    typeRows.find((t) => t.slug === "e_bike")?.id ?? "";
  const colors: ColorOption[] = colorsRes.data ?? [];
  const isOneOff = sp.mode === "oneoff";

  // Coverage preview payload: BOM rows per current template + per-part
  // stock and last landed cost, keyed for client-side aggregation.
  const boms: Record<string, { partId: string; qty: number }[]> = {};
  const partIdSet = new Set<string>();
  for (const row of bomsRes.data ?? []) {
    const tpl = Array.isArray(row.template) ? row.template[0] : row.template;
    if (!tpl?.is_current) continue;
    (boms[row.template_id] ??= []).push({
      partId: row.part_id,
      qty: Number(row.quantity),
    });
    partIdSet.add(row.part_id);
  }
  const partsInfo: Record<
    string,
    { sku: string; name: string; onHand: number; lastCost: number | null }
  > = {};
  if (partIdSet.size > 0) {
    const partIds = [...partIdSet];
    const [stockRes, costRes] = await Promise.all([
      supabase.from("v_current_stock").select("part_id, quantity_on_hand"),
      supabase
        .from("v_part_last_cost")
        .select("part_id, last_cost_dkk")
        .in("part_id", partIds),
    ]);
    const onHand = new Map<string, number>();
    for (const s of stockRes.data ?? []) {
      if (!s.part_id) continue;
      onHand.set(
        s.part_id,
        (onHand.get(s.part_id) ?? 0) + Number(s.quantity_on_hand ?? 0),
      );
    }
    const lastCost = new Map<string, number>();
    for (const c of costRes.data ?? []) {
      if (c.part_id) lastCost.set(c.part_id, Number(c.last_cost_dkk ?? 0));
    }
    for (const row of bomsRes.data ?? []) {
      if (!partIdSet.has(row.part_id) || partsInfo[row.part_id]) continue;
      const part = Array.isArray(row.part) ? row.part[0] : row.part;
      partsInfo[row.part_id] = {
        sku: part?.internal_sku ?? "—",
        name: part?.name_en ?? "—",
        onHand: onHand.get(row.part_id) ?? 0,
        lastCost: lastCost.get(row.part_id) ?? null,
      };
    }
  }

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
              <Link href="/manufacturing-orders">Manufacturing orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isOneOff ? "New one-off build" : "New manufacturing orders"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isOneOff ? (
            <>
              No template — you assemble the parts list by hand on the next
              screen.{" "}
              <Link
                href="/manufacturing-orders/new"
                className="hover:text-foreground underline underline-offset-4"
              >
                Back to batch creation
              </Link>
            </>
          ) : (
            "Build the batch row by row — each row becomes one MO with its parts list seeded from the template, and the bikes can be created in the same go."
          )}
        </p>
      </div>
      {isOneOff ? (
        <MOForm
          initial={{
            ...EMPTY_MO_FORM,
            bike_template_id: ONE_OFF_VALUE,
            bike_type_id: defaultBikeTypeId,
          }}
          templates={templates}
          bikeTypes={bikeTypes}
          colors={colors}
        />
      ) : (
        <MOBatchForm
          templates={templates}
          colors={colors}
          initialTemplateId={sp.template}
          boms={boms}
          partsInfo={partsInfo}
        />
      )}
    </div>
  );
}
