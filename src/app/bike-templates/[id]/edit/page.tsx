import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

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
  type FamilyOption,
  type TemplateShellValues,
} from "../../_components/template-form";

export default async function EditBikeTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCommon] = await Promise.all([
    getTranslations("templates"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const [tplRes, typesRes, currenciesRes, familiesRes] = await Promise.all([
    supabase
      .from("bike_templates")
      .select(
        `
          id, name_en, name_da, notes, version, is_current,
          bike_type_id, family_id, frame_size,
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
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    supabase
      .from("bike_families")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (tplRes.error) {
    throw new Error(`Failed to load template: ${tplRes.error.message}`);
  }
  if (!tplRes.data) notFound();

  const tpl = tplRes.data;
  const initial: TemplateShellValues = {
    bike_type_id: tpl.bike_type_id,
    family_id: tpl.family_id ?? "",
    frame_size: tpl.frame_size,
    name_en: tpl.name_en,
    name_da: tpl.name_da ?? "",
    default_retail_price:
      tpl.default_retail_price == null ? "" : String(tpl.default_retail_price),
    default_retail_currency: tpl.default_retail_currency ?? "DKK",
    notes: tpl.notes ?? "",
  };
  const bikeTypes: BikeTypeOption[] = typesRes.data ?? [];
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];
  const families: FamilyOption[] = familiesRes.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/bike-templates">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/bike-templates/${tpl.id}`}>{tpl.name_en}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbEdit")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("editTitle", { name: tpl.name_en })}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          v{tpl.version}
          {tpl.is_current ? t("currentSuffix") : ""}
        </p>
      </div>
      <TemplateForm
        mode="edit"
        templateId={tpl.id}
        initial={initial}
        bikeTypes={bikeTypes}
        currencies={currencies}
        families={families}
      />
    </div>
  );
}
