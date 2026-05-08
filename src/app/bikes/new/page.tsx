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
  BikeForm,
  EMPTY_BIKE_FORM,
  type ModelOption,
  type TemplateOption,
  type VariantOption,
} from "../_components/bike-form";

export default async function NewBikePage() {
  const supabase = await createClient();
  const [bikeTypesRes, modelsRes, variantsRes, templatesRes] = await Promise.all([
    supabase
      .from("bike_types")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("bike_models")
      .select("id, name_en, bike_type_id")
      .is("deleted_at", null)
      .order("name_en", { ascending: true }),
    supabase
      .from("bike_model_variants")
      .select("id, bike_model_id, sku, name_en")
      .eq("is_active", true)
      .order("sku", { ascending: true }),
    supabase
      .from("bike_templates")
      .select("id, bike_model_id, bike_model_variant_id, name_en, version")
      .eq("is_current", true)
      .order("name_en", { ascending: true }),
  ]);

  const models: ModelOption[] = modelsRes.data ?? [];
  const variants: VariantOption[] = variantsRes.data ?? [];
  const templates: TemplateOption[] = templatesRes.data ?? [];

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
              <Link href="/bikes">Bikes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New bike</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          For one-off builds, demos, or refurb candidates. Production bikes
          will come through the manufacturing-order flow (Phase 2C).
        </p>
      </div>
      <BikeForm
        initial={EMPTY_BIKE_FORM}
        bikeTypes={bikeTypesRes.data ?? []}
        models={models}
        variants={variants}
        templates={templates}
      />
    </div>
  );
}
