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
  type BikeTypeOption,
  type CurrencyOption,
  type TemplateShellValues,
} from "../../_components/template-form";

export default async function EditBikeTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [tplRes, typesRes, currenciesRes] = await Promise.all([
    supabase
      .from("bike_templates")
      .select(
        `
          id, name_en, name_da, notes, version, is_current,
          bike_type_id, family, frame_size,
          default_retail_price, default_retail_currency
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("bike_types")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("currencies")
      .select("code, symbol")
      .order("code", { ascending: true }),
  ]);

  if (tplRes.error) {
    throw new Error(`Failed to load template: ${tplRes.error.message}`);
  }
  if (!tplRes.data) notFound();

  const t = tplRes.data;
  const initial: TemplateShellValues = {
    bike_type_id: t.bike_type_id,
    family: t.family ?? "",
    frame_size: t.frame_size,
    name_en: t.name_en,
    name_da: t.name_da ?? "",
    default_retail_price:
      t.default_retail_price == null ? "" : String(t.default_retail_price),
    default_retail_currency: t.default_retail_currency ?? "DKK",
    notes: t.notes ?? "",
  };
  const bikeTypes: BikeTypeOption[] = typesRes.data ?? [];
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];

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
        bikeTypes={bikeTypes}
        currencies={currencies}
      />
    </div>
  );
}
