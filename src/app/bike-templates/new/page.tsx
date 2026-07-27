import Link from "next/link";
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
} from "../_components/template-form";

export default async function NewBikeTemplatePage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("templates"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const [typesRes, currenciesRes, familiesRes] = await Promise.all([
    supabase
      .from("bike_types")
      .select("id, slug, name_en, name_da")
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

  const typeRows = typesRes.data ?? [];
  const bikeTypes: BikeTypeOption[] = typeRows.map(({ id, name_en, name_da }) => ({
    id,
    name_en,
    name_da,
  }));
  const defaultBikeTypeId =
    typeRows.find((t) => t.slug === "e_bike")?.id ?? "";
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
            <BreadcrumbPage>{t("crumbNew")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("newTemplate")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("newSubtitle")}</p>
      </div>
      <TemplateForm
        mode="create"
        initial={{ bike_type_id: defaultBikeTypeId }}
        bikeTypes={bikeTypes}
        currencies={currencies}
        families={families}
      />
    </div>
  );
}
