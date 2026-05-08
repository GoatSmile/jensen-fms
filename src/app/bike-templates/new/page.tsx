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
  EMPTY_TEMPLATE_SHELL,
  TemplateForm,
  type ModelOption,
  type VariantOption,
} from "../_components/template-form";

type SearchParams = {
  model?: string;
};

export default async function NewBikeTemplatePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [modelsRes, variantsRes] = await Promise.all([
    supabase
      .from("bike_models")
      .select("id, name_en, bike_type:bike_types(name_en)")
      .is("deleted_at", null)
      .order("name_en", { ascending: true }),
    supabase
      .from("bike_model_variants")
      .select("id, bike_model_id, sku, name_en, is_active")
      .eq("is_active", true)
      .order("sku", { ascending: true }),
  ]);

  const models: ModelOption[] = (modelsRes.data ?? []).map((m) => ({
    id: m.id,
    name_en: m.name_en,
    bike_type_name: m.bike_type?.name_en ?? null,
  }));
  const variants: VariantOption[] = variantsRes.data ?? [];

  const initial = {
    ...EMPTY_TEMPLATE_SHELL,
    bike_model_id: sp.model ?? "",
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
              <Link href="/bike-templates">Bike templates</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New template</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Add the parts recipe after the template shell is created.
        </p>
      </div>
      <TemplateForm
        mode="create"
        initial={initial}
        models={models}
        variants={variants}
      />
    </div>
  );
}
