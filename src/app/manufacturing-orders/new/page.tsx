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
  const { data, error } = await supabase
    .from("bike_templates")
    .select(
      `
        id, name_en, version, is_current,
        bike_model:bike_models(name_en),
        bike_model_variant:bike_model_variants(name_en),
        bike_type:bike_types(name_en)
      `,
    )
    .eq("is_current", true)
    .order("name_en", { ascending: true });

  if (error) {
    throw new Error(`Failed to load templates: ${error.message}`);
  }

  const templates: TemplateOption[] = (data ?? []).map((t) => ({
    id: t.id,
    name_en: t.name_en,
    version: t.version,
    is_current: t.is_current,
    bike_model_name: t.bike_model?.name_en ?? null,
    bike_model_variant_name: t.bike_model_variant?.name_en ?? null,
    bike_type_name: t.bike_type?.name_en ?? null,
  }));

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
          The MO copies the template&rsquo;s parts list as a starting point.
          You can substitute, add, or remove parts after creation.
        </p>
      </div>
      <MOForm
        initial={{ ...EMPTY_MO_FORM, bike_template_id: sp.template ?? "" }}
        templates={templates}
      />
    </div>
  );
}
