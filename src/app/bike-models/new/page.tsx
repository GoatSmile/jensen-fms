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
  BikeModelForm,
  EMPTY_BIKE_MODEL_FORM,
} from "../_components/bike-model-form";

export default async function NewBikeModelPage() {
  const supabase = await createClient();
  const [bikeTypesRes, currenciesRes] = await Promise.all([
    supabase
      .from("bike_types")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase.from("currencies").select("code, name_en").order("code"),
  ]);

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
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New bike model</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Add variants and templates after the model is created.
        </p>
      </div>
      <BikeModelForm
        mode="create"
        initial={EMPTY_BIKE_MODEL_FORM}
        bikeTypes={bikeTypesRes.data ?? []}
        currencies={currenciesRes.data ?? []}
      />
    </div>
  );
}
