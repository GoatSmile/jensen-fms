import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./_components/settings-form";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("default_transport_pct")
    .eq("id", 1)
    .maybeSingle();
  const defaultTransportPct = Number(data?.default_transport_pct ?? 0.10);

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
    </div>
  );
}
