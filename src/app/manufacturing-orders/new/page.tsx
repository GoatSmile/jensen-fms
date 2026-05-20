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
  type BikeTypeOption,
  type ColorOption,
  type TemplateOption,
} from "../_components/mo-form";

type SearchParams = {
  template?: string;
};

export default async function NewManufacturingOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [templatesRes, bikeTypesRes, colorsRes] = await Promise.all([
    supabase
      .from("bike_templates")
      .select(
        `
          id, name_en, family, frame_size, version, is_current, bike_type_id,
          bike_type:bike_types(name_en)
        `,
      )
      .eq("is_current", true)
      .order("family", { ascending: true, nullsFirst: false })
      .order("frame_size", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("bike_types")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("colors")
      .select("id, slug, name_da, name_en, hex")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (templatesRes.error) {
    throw new Error(`Failed to load templates: ${templatesRes.error.message}`);
  }

  const templates: TemplateOption[] = (templatesRes.data ?? []).map((t) => ({
    id: t.id,
    name_en: t.name_en,
    family: t.family,
    frame_size: t.frame_size,
    version: t.version,
    is_current: t.is_current,
    bike_type_id: t.bike_type_id,
    bike_type_name: t.bike_type?.name_en ?? null,
  }));
  const bikeTypes: BikeTypeOption[] = bikeTypesRes.data ?? [];
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
          New manufacturing order
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Picking a template seeds the parts list automatically. One-off builds
          start with an empty BOM that you fill in on the next screen.
        </p>
      </div>
      <MOForm
        initial={{ ...EMPTY_MO_FORM, bike_template_id: sp.template ?? "" }}
        templates={templates}
        bikeTypes={bikeTypes}
        colors={colors}
      />
    </div>
  );
}
