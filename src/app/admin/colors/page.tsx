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
  ColorsSection,
  type ColorRow,
} from "./_components/colors-section";
import {
  CoatingsSection,
  type CoatingRow,
} from "./_components/coatings-section";

export default async function AdminColorsPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminColors"),
    getTranslations("common"),
  ]);

  const [colorsRes, bikeUsageRes, moUsageRes, coatingsRes] = await Promise.all([
    supabase
      .from("colors")
      .select("id, slug, name_en, name_da, hex, ral_code, coating, sort_order, is_active")
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("bikes")
      .select("color_id")
      .not("color_id", "is", null)
      .is("deleted_at", null),
    supabase
      .from("manufacturing_orders")
      .select("color_id")
      .not("color_id", "is", null),
    supabase
      .from("coatings")
      .select("id, slug, label_en, label_da, sort_order, is_active")
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("label_en", { ascending: true }),
  ]);

  if (colorsRes.error) {
    throw new Error(`Failed to load colours: ${colorsRes.error.message}`);
  }

  // Combined usage: bikes + MOs. A colour with non-zero usage shouldn't be
  // hard-deleted; archive only.
  const usageById = new Map<string, number>();
  for (const b of bikeUsageRes.data ?? []) {
    if (!b.color_id) continue;
    usageById.set(b.color_id, (usageById.get(b.color_id) ?? 0) + 1);
  }
  for (const m of moUsageRes.data ?? []) {
    if (!m.color_id) continue;
    usageById.set(m.color_id, (usageById.get(m.color_id) ?? 0) + 1);
  }

  const rows: ColorRow[] = (colorsRes.data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    nameEn: c.name_en,
    nameDa: c.name_da,
    hex: c.hex,
    ralCode: c.ral_code,
    coating: c.coating,
    sortOrder: c.sort_order,
    isActive: c.is_active,
    usageCount: usageById.get(c.id) ?? 0,
  }));

  const coatingRows: CoatingRow[] = (coatingsRes.data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    labelEn: c.label_en,
    labelDa: c.label_da,
    sortOrder: c.sort_order,
    isActive: c.is_active,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbColours")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("pageDescription")}</p>
      </header>

      <ColorsSection rows={rows} />

      <CoatingsSection rows={coatingRows} />
    </div>
  );
}
