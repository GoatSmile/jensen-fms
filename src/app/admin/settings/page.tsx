import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ReportUrlCard } from "@/components/report-url-card";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./_components/settings-form";
import {
  LocationSettingsForm,
  type LocationChoice,
} from "./_components/location-settings-form";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const [settingsRes, locationsRes] = await Promise.all([
    supabase
      .from("app_settings")
      .select("default_transport_pct, primary_location_id, hide_location_info")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("inventory_locations")
      .select("id, code, name_en")
      .eq("is_active", true)
      .order("code", { ascending: true }),
  ]);
  const data = settingsRes.data;
  const defaultTransportPct = Number(data?.default_transport_pct ?? 0.10);
  const primaryLocationId = data?.primary_location_id ?? "";
  const hideLocationInfo = data?.hide_location_info ?? false;
  const locationChoices: LocationChoice[] = (locationsRes.data ?? []).map(
    (l) => ({ id: l.id, label: `${l.name_en} (${l.code})` }),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/admin">Admin</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          App-wide defaults read at form load. Snapshots already written to PO
          lines or HS codes are not touched.
        </p>
      </header>

      <ReportUrlCard />

      <section className="rounded-md border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Purchasing</h2>
          <p className="text-muted-foreground text-xs">
            Default values pre-filled into new PO line dialogs.
          </p>
        </header>
        <div className="p-4">
          <SettingsForm initialDefaultTransportPct={defaultTransportPct} />
        </div>
      </section>

      <section className="rounded-md border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Locations</h2>
          <p className="text-muted-foreground text-xs">
            The primary site for stock, and whether to show location detail
            app-wide. Manage the list of locations under{" "}
            <Link href="/admin/locations" className="underline">
              Locations
            </Link>
            .
          </p>
        </header>
        <div className="p-4">
          <LocationSettingsForm
            locations={locationChoices}
            initialPrimaryId={primaryLocationId}
            initialHide={hideLocationInfo}
          />
        </div>
      </section>
    </div>
  );
}
