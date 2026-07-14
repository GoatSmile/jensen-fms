import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ColorSwatch } from "@/components/color-swatch";
import { createClient } from "@/lib/supabase/server";
import { localizedName } from "@/i18n/vocab";

import { ArchiveButton } from "../_components/archive-button";
import {
  ColorForm,
  type ColorFormValues,
  type CoatingChoice,
} from "../_components/color-form";

export default async function ColorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("adminColors"),
    getTranslations("common"),
    getLocale(),
  ]);

  // Pull the row + usage counts (bikes + MOs) in parallel. Usage drives
  // the archive-button warning copy.
  const [colorRes, bikeUsageRes, moUsageRes, coatingsRes] = await Promise.all([
    supabase
      .from("colors")
      .select(
        "id, slug, name_en, name_da, hex, ral_code, coating, sort_order, is_active",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("bikes")
      .select("id", { count: "exact", head: true })
      .eq("color_id", id)
      .is("deleted_at", null),
    supabase
      .from("manufacturing_orders")
      .select("id", { count: "exact", head: true })
      .eq("color_id", id),
    supabase
      .from("coatings")
      .select("slug, label_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (colorRes.error) {
    throw new Error(`Failed to load colour: ${colorRes.error.message}`);
  }
  if (!colorRes.data) notFound();

  const c = colorRes.data;
  const displayName = localizedName(locale, c.name_en, c.name_da);
  const usageCount = (bikeUsageRes.count ?? 0) + (moUsageRes.count ?? 0);
  const coatings: CoatingChoice[] = (coatingsRes.data ?? []).map((x) => ({
    slug: x.slug,
    label: x.label_en,
  }));

  const initial: ColorFormValues = {
    name_en: c.name_en,
    name_da: c.name_da ?? "",
    slug: c.slug,
    hex: c.hex ?? "",
    ral_code: c.ral_code ?? "",
    coating: c.coating ?? "",
    sort_order: String(c.sort_order ?? 100),
    is_active: c.is_active,
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
            <BreadcrumbLink asChild>
              <Link href="/admin/colors">{t("crumbColours")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{displayName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ColorSwatch
            hex={c.hex}
            ralCode={c.ral_code}
            label={displayName}
            size={6}
          />
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold">{displayName}</h1>
            <p className="text-muted-foreground font-mono text-xs">{c.slug}</p>
          </div>
        </div>
        <Badge variant={c.is_active ? "success" : "outline"}>
          {c.is_active ? t("statusActive") : t("statusArchived")}
        </Badge>
      </header>

      <ColorForm
        mode={{ kind: "edit", id: c.id }}
        initial={initial}
        coatings={coatings}
      />

      <ArchiveButton
        id={c.id}
        isActive={c.is_active}
        usageCount={usageCount}
      />
    </div>
  );
}
