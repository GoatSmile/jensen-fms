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
  TemplateForm,
  type ModelOption,
  type TemplateShellValues,
  type VariantOption,
} from "../../_components/template-form";

export default async function EditBikeTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [tplRes, modelsRes, variantsRes] = await Promise.all([
    supabase
      .from("bike_templates")
      .select(
        `
          id, name_en, name_da, notes, version, is_current,
          bike_model_id, bike_model_variant_id, bike_type_id,
          bike_model:bike_models(id, name_en),
          bike_model_variant:bike_model_variants(id, sku, name_en)
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("bike_models")
      .select("id, name_en, bike_type:bike_types(name_en)")
      .is("deleted_at", null)
      .order("name_en", { ascending: true }),
    supabase
      .from("bike_model_variants")
      .select("id, bike_model_id, sku, name_en, is_active")
      .order("sku", { ascending: true }),
  ]);

  if (tplRes.error) {
    throw new Error(`Failed to load template: ${tplRes.error.message}`);
  }
  if (!tplRes.data) notFound();

  const t = tplRes.data;
  const initial: TemplateShellValues = {
    bike_model_id: t.bike_model_id,
    bike_model_variant_id: t.bike_model_variant_id ?? "all",
    name_en: t.name_en,
    name_da: t.name_da ?? "",
    notes: t.notes ?? "",
  };
  const models: ModelOption[] = (modelsRes.data ?? []).map((m) => ({
    id: m.id,
    name_en: m.name_en,
    bike_type_name: m.bike_type?.name_en ?? null,
  }));
  const variants: VariantOption[] = variantsRes.data ?? [];

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
            <BreadcrumbLink asChild>
              <Link href={`/bike-templates/${t.id}`}>{t.name_en}</Link>
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
          Edit {t.name_en}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          v{t.version}
          {t.is_current ? " · current" : ""}
        </p>
      </div>
      <TemplateForm
        mode="edit"
        templateId={t.id}
        initial={initial}
        models={models}
        variants={variants}
      />
    </div>
  );
}
