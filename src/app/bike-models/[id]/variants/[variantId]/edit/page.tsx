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
  VariantForm,
  type VariantFormValues,
} from "../../../_components/variant-form";

export default async function EditVariantPage({
  params,
}: {
  params: Promise<{ id: string; variantId: string }>;
}) {
  const { id, variantId } = await params;
  const supabase = await createClient();

  const [modelRes, variantRes, currenciesRes] = await Promise.all([
    supabase
      .from("bike_models")
      .select("id, name_en")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("bike_model_variants")
      .select(
        "id, sku, name_en, name_da, frame_size, color_en, color_da, retail_price, retail_currency, is_active, configuration, bike_model_id",
      )
      .eq("id", variantId)
      .maybeSingle(),
    supabase.from("currencies").select("code, name_en").order("code"),
  ]);

  if (modelRes.error) {
    throw new Error(`Failed to load model: ${modelRes.error.message}`);
  }
  if (variantRes.error) {
    throw new Error(`Failed to load variant: ${variantRes.error.message}`);
  }
  if (!modelRes.data || !variantRes.data) notFound();
  if (variantRes.data.bike_model_id !== id) notFound();

  const v = variantRes.data;
  const initial: VariantFormValues = {
    sku: v.sku,
    name_en: v.name_en,
    name_da: v.name_da ?? "",
    frame_size: v.frame_size ?? "",
    color_en: v.color_en ?? "",
    color_da: v.color_da ?? "",
    retail_price: v.retail_price != null ? String(v.retail_price) : "",
    retail_currency: v.retail_currency ?? "DKK",
    is_active: v.is_active,
    configuration: Object.entries(
      (v.configuration as Record<string, unknown>) ?? {},
    ).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    })),
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
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
              <Link href="/bike-models">Bike models</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/bike-models/${modelRes.data.id}`}>
                {modelRes.data.name_en}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit variant</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {v.name_en}
        </h1>
        <p className="text-muted-foreground mt-1 font-mono text-xs">{v.sku}</p>
      </div>
      <VariantForm
        mode="edit"
        modelId={modelRes.data.id}
        variantId={v.id}
        initial={initial}
        currencies={currenciesRes.data ?? []}
      />
    </div>
  );
}
