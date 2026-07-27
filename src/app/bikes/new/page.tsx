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
  BikeForm,
  type BikeTypeOption,
  type ColorOption,
  type TemplateOption,
} from "../_components/bike-form";

export default async function NewBikePage() {
  const [t, tc] = await Promise.all([
    getTranslations("bikes"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();
  const [bikeTypesRes, templatesRes, colorsRes] = await Promise.all([
    supabase
      .from("bike_types")
      .select("id, slug, name_en, name_da")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("bike_templates")
      .select(
        "id, name_en, family:bike_families(name, sort_order), frame_size, version, bike_type_id",
      )
      .eq("is_current", true)
      .order("frame_size", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("colors")
      .select("id, slug, name_da, name_en, hex")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const typeRows = bikeTypesRes.data ?? [];
  const bikeTypes: BikeTypeOption[] = typeRows.map(({ id, name_en, name_da }) => ({
    id,
    name_en,
    name_da,
  }));
  const defaultBikeTypeId =
    typeRows.find((t) => t.slug === "e_bike")?.id ?? "";
  // Family-adjacent ordering (admin sort_order, then name) so the picker
  // keeps all sizes of a family together instead of interleaving by size.
  const templates: TemplateOption[] = (templatesRes.data ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.family?.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.family?.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        (a.family?.name ?? a.name_en).localeCompare(
          b.family?.name ?? b.name_en,
        ) ||
        a.frame_size.localeCompare(b.frame_size, undefined, { numeric: true }),
    )
    .map((t) => ({
      ...t,
      family: t.family?.name ?? null,
    }));
  const colors: ColorOption[] = colorsRes.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tc("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/bikes">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("newCrumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("newBike")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("newSubtitle")}
        </p>
      </div>
      <BikeForm
        initial={{ bike_type_id: defaultBikeTypeId }}
        bikeTypes={bikeTypes}
        templates={templates}
        colors={colors}
      />
    </div>
  );
}
