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
  LocationsSection,
  type LocationRow,
} from "./_components/locations-section";
import { LocationVisibilityToggle } from "./_components/location-visibility-toggle";

export default async function AdminLocationsPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminLocations"),
    getTranslations("common"),
  ]);

  const [locRes, movesRes, settingsRes] = await Promise.all([
    supabase
      .from("inventory_locations")
      .select("id, code, name_en, name_da, address, is_active")
      .order("is_active", { ascending: false })
      .order("code", { ascending: true }),
    supabase.from("inventory_movements").select("location_id"),
    supabase
      .from("app_settings")
      .select("primary_location_id, hide_location_info")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (locRes.error) {
    throw new Error(`Failed to load locations: ${locRes.error.message}`);
  }

  const primaryId = settingsRes.data?.primary_location_id ?? null;
  const hidden = settingsRes.data?.hide_location_info ?? false;

  const movesById = new Map<string, number>();
  for (const m of movesRes.data ?? []) {
    if (!m.location_id) continue;
    movesById.set(m.location_id, (movesById.get(m.location_id) ?? 0) + 1);
  }

  const rows: LocationRow[] = (locRes.data ?? []).map((l) => ({
    id: l.id,
    code: l.code,
    nameEn: l.name_en,
    nameDa: l.name_da,
    address: l.address,
    isActive: l.is_active,
    isPrimary: l.id === primaryId,
    movementCount: movesById.get(l.id) ?? 0,
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
            <BreadcrumbPage>{t("crumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <LocationVisibilityToggle hidden={hidden} />

      <LocationsSection rows={rows} />
    </div>
  );
}
