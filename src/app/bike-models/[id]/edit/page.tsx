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
  BikeModelForm,
  type BikeModelFormValues,
} from "../../_components/bike-model-form";

export default async function EditBikeModelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [modelRes, bikeTypesRes, currenciesRes] = await Promise.all([
    supabase
      .from("bike_models")
      .select(
        "id, bike_type_id, name_en, name_da, description_en, description_da, manufacturer, model_year, headline_retail_price, headline_currency, frame_number_code",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("bike_types")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase.from("currencies").select("code, name_en").order("code"),
  ]);

  if (modelRes.error) {
    throw new Error(`Failed to load model: ${modelRes.error.message}`);
  }
  if (!modelRes.data) notFound();

  const m = modelRes.data;
  const initial: BikeModelFormValues = {
    bike_type_id: m.bike_type_id,
    name_en: m.name_en,
    name_da: m.name_da ?? "",
    description_en: m.description_en ?? "",
    description_da: m.description_da ?? "",
    manufacturer: m.manufacturer ?? "",
    model_year: m.model_year != null ? String(m.model_year) : "",
    headline_retail_price:
      m.headline_retail_price != null ? String(m.headline_retail_price) : "",
    headline_currency: m.headline_currency ?? "DKK",
    frame_number_code: m.frame_number_code ?? "",
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
              <Link href={`/bike-models/${m.id}`}>{m.name_en}</Link>
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
          Edit {m.name_en}
        </h1>
      </div>
      <BikeModelForm
        mode="edit"
        modelId={m.id}
        initial={initial}
        bikeTypes={bikeTypesRes.data ?? []}
        currencies={currenciesRes.data ?? []}
      />
    </div>
  );
}
