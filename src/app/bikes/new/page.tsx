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
  type BikeTypeOption,
  type ColorOption,
  type TemplateOption,
} from "../_components/bike-form";

export default async function NewBikePage() {
  const supabase = await createClient();
  const [bikeTypesRes, templatesRes, colorsRes] = await Promise.all([
    supabase
      .from("bike_types")
      .select("id, slug, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("bike_templates")
      .select("id, name_en, family, frame_size, version, bike_type_id")
      .eq("is_current", true)
      .order("family", { ascending: true, nullsFirst: false })
      .order("frame_size", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("colors")
      .select("id, slug, name_da, name_en, hex")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const typeRows = bikeTypesRes.data ?? [];
  const bikeTypes: BikeTypeOption[] = typeRows.map(({ id, name_en }) => ({
    id,
    name_en,
  }));
  const defaultBikeTypeId =
    typeRows.find((t) => t.slug === "e_bike")?.id ?? "";
  const templates: TemplateOption[] = templatesRes.data ?? [];
  const colors: ColorOption[] = colorsRes.data ?? [];

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
          come through the manufacturing-order flow.
        </p>
      </div>
      <BikeForm
        initial={{ ...EMPTY_BIKE_FORM, bike_type_id: defaultBikeTypeId }}
        bikeTypes={bikeTypes}
        templates={templates}
        colors={colors}
      />
    </div>
  );
}
