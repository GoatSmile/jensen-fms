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

import {
  PartForm,
  type PartFormValues,
} from "../../_components/part-form";

export default async function EditPartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [partRes, categoriesRes, currenciesRes, hsCodesRes] = await Promise.all([
    supabase
      .from("parts")
      .select(
        "id, internal_sku, name_en, name_da, description_en, description_da, category_id, hs_code_id, unit_of_measure, default_retail_price, default_retail_currency, weight_grams, reorder_point, reorder_quantity, notes, attributes",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("part_categories")
      .select("id, name_en, parent_id")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase.from("currencies").select("code, name_en").order("code"),
    supabase
      .from("hs_codes")
      .select("id, code, description, tariff_pct, is_active")
      .order("is_active", { ascending: false })
      .order("code", { ascending: true }),
  ]);

  if (partRes.error) {
    throw new Error(`Failed to load part: ${partRes.error.message}`);
  }
  if (!partRes.data) notFound();

  const part = partRes.data;

  // Include archived HS codes in the dropdown so editing a part that's
  // currently classified under one shows the value (even if pickers in other
  // contexts hide it). Active codes come first via the order() above.
  const hsCodes = (hsCodesRes.data ?? []).map((h) => ({
    id: h.id,
    code: h.code + (h.is_active ? "" : " (archived)"),
    description: h.description,
    tariffPct: Number(h.tariff_pct),
  }));

  const initial: PartFormValues = {
    internal_sku: part.internal_sku,
    name_en: part.name_en,
    name_da: part.name_da ?? "",
    description_en: part.description_en ?? "",
    description_da: part.description_da ?? "",
    category_id: part.category_id,
    hs_code_id: part.hs_code_id ?? "",
    unit_of_measure: part.unit_of_measure,
    default_retail_price:
      part.default_retail_price != null ? String(part.default_retail_price) : "",
    default_retail_currency: part.default_retail_currency ?? "DKK",
    weight_grams: part.weight_grams != null ? String(part.weight_grams) : "",
    reorder_point:
      part.reorder_point != null ? String(part.reorder_point) : "",
    reorder_quantity:
      part.reorder_quantity != null ? String(part.reorder_quantity) : "",
    notes: part.notes ?? "",
    attributes: Object.entries(
      (part.attributes as Record<string, unknown>) ?? {},
    ).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    })),
  };

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
              <Link href="/parts">Parts</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/parts/${part.id}`}>{part.internal_sku}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {part.name_en}
        </h1>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {part.internal_sku}
        </p>
      </div>

      <PartForm
        mode="edit"
        partId={part.id}
        initial={initial}
        categories={categoriesRes.data ?? []}
        currencies={currenciesRes.data ?? []}
        hsCodes={hsCodes}
      />
    </div>
  );
}
