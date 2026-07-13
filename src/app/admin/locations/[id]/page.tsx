import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";

import { ArchiveButton } from "../_components/archive-button";
import {
  LocationForm,
  type LocationFormValues,
} from "../_components/location-form";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminLocations"),
    getTranslations("common"),
  ]);

  const [locRes, movesRes, settingsRes] = await Promise.all([
    supabase
      .from("inventory_locations")
      .select("id, code, name_en, name_da, address, is_active")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("location_id", id),
    supabase
      .from("app_settings")
      .select("primary_location_id")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (locRes.error) {
    throw new Error(`Failed to load location: ${locRes.error.message}`);
  }
  if (!locRes.data) notFound();

  const l = locRes.data;
  const movementCount = movesRes.count ?? 0;
  const isPrimary = settingsRes.data?.primary_location_id === l.id;

  const initial: LocationFormValues = {
    code: l.code,
    name_en: l.name_en,
    name_da: l.name_da ?? "",
    address: l.address ?? "",
    is_active: l.is_active,
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
              <Link href="/admin/locations">{t("crumb")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{l.name_en}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold">{l.name_en}</h1>
          <p className="text-muted-foreground font-mono text-xs">{l.code}</p>
        </div>
        <div className="flex items-center gap-2">
          {isPrimary ? (
            <Badge variant="secondary">{t("badgePrimary")}</Badge>
          ) : null}
          <Badge variant={l.is_active ? "success" : "outline"}>
            {l.is_active ? t("statusActive") : t("statusArchived")}
          </Badge>
        </div>
      </header>

      <LocationForm mode={{ kind: "edit", id: l.id }} initial={initial} />

      <ArchiveButton
        id={l.id}
        isActive={l.is_active}
        isPrimary={isPrimary}
        movementCount={movementCount}
      />
    </div>
  );
}
