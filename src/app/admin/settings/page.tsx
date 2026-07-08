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
import { CommunicationSettingsForm } from "./_components/communication-settings-form";
import { EmailDnsCard } from "./_components/email-dns-card";
import type { EmailDnsRecord } from "./_actions/save-settings";
import {
  LocationSettingsForm,
  type LocationChoice,
} from "./_components/location-settings-form";
import { LanguageSettingsForm } from "./_components/language-settings-form";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const [settingsRes, locationsRes] = await Promise.all([
    supabase
      .from("app_settings")
      .select(
        "default_transport_pct, primary_location_id, hide_location_info, app_language, worker_language, outbound_from_email, outbound_reply_to_email, outbound_test_mode, outbound_test_email, workshop_phone, email_domain, email_dns_records",
      )
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
  const appLanguage = (data?.app_language === "da" ? "da" : "en") as "en" | "da";
  const workerLanguage = (
    data?.worker_language === "da" ? "da" : "en"
  ) as "en" | "da";
  const locationChoices: LocationChoice[] = (locationsRes.data ?? []).map(
    (l) => ({ id: l.id, label: `${l.name_en} (${l.code})` }),
  );

  // The jsonb rows were validated on write (saveEmailDnsSettings), but read
  // defensively — a hand-edited row shouldn't crash the settings page.
  const dnsRecords: EmailDnsRecord[] = Array.isArray(data?.email_dns_records)
    ? (data.email_dns_records as unknown[]).flatMap((r) => {
        if (typeof r !== "object" || r === null) return [];
        const row = r as Record<string, unknown>;
        return [
          {
            type: (["TXT", "CNAME", "MX"].includes(String(row.type))
              ? String(row.type)
              : "TXT") as EmailDnsRecord["type"],
            name: String(row.name ?? ""),
            value: String(row.value ?? ""),
            status: (String(row.status) === "verified"
              ? "verified"
              : "pending") as EmailDnsRecord["status"],
            note: String(row.note ?? ""),
          },
        ];
      })
    : [];

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
          <h2 className="text-sm font-semibold">Language</h2>
          <p className="text-muted-foreground text-xs">
            Working language for the office app and the workshop floor. Defaults
            to English.
          </p>
        </header>
        <div className="p-4">
          <LanguageSettingsForm
            initialAppLanguage={appLanguage}
            initialWorkerLanguage={workerLanguage}
          />
        </div>
      </section>

      <section className="rounded-md border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Communication</h2>
          <p className="text-muted-foreground text-xs">
            Sender identity for app-generated email (PO to supplier; the
            phone-call pipeline later) and the workshop phone. Test mode
            reroutes all mail to the test inboxes.
          </p>
        </header>
        <div className="p-4">
          <CommunicationSettingsForm
            initialFromEmail={data?.outbound_from_email ?? ""}
            initialReplyToEmail={data?.outbound_reply_to_email ?? ""}
            initialTestMode={data?.outbound_test_mode ?? true}
            initialTestEmail={data?.outbound_test_email ?? ""}
            initialWorkshopPhone={data?.workshop_phone ?? ""}
          />
        </div>
      </section>

      <section className="rounded-md border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Sending domain (DNS)</h2>
          <p className="text-muted-foreground text-xs">
            Reference copy of the DNS records the email provider needs for
            domain verification. The records take effect at the DNS host —
            keep the values and their status here so they&rsquo;re never
            buried in a dashboard or an email thread.
          </p>
        </header>
        <div className="p-4">
          <EmailDnsCard
            initialDomain={data?.email_domain ?? ""}
            initialRecords={dnsRecords}
          />
        </div>
      </section>

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
