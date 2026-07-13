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
import { ReportUrlCard } from "@/components/report-url-card";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./_components/settings-form";
import { CommunicationSettingsForm } from "./_components/communication-settings-form";
import { EmailDnsCard } from "./_components/email-dns-card";
import type { EmailDnsRecord } from "./_actions/save-settings";
import { LanguageSettingsForm } from "./_components/language-settings-form";
import { EconomicSettingsForm } from "./_components/economic-settings-form";
import { economicEnvReady } from "@/lib/economic/client";

export default async function AdminSettingsPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("adminSettings"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();
  const settingsRes = await supabase
    .from("app_settings")
    .select(
      "default_transport_pct, app_language, worker_language, outbound_from_email, outbound_reply_to_email, outbound_test_mode, outbound_test_email, workshop_phone, email_domain, email_dns_records, economic_enabled, economic_journal_number, economic_revenue_account, economic_vat_code, economic_customer_group, economic_vat_zone, economic_payment_terms",
    )
    .eq("id", 1)
    .maybeSingle();
  const data = settingsRes.data;
  const defaultTransportPct = Number(data?.default_transport_pct ?? 0.10);
  const appLanguage = (data?.app_language === "da" ? "da" : "en") as "en" | "da";
  const workerLanguage = (
    data?.worker_language === "da" ? "da" : "en"
  ) as "en" | "da";

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
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <ReportUrlCard />

      <section className="rounded-md border border-violet-200/70 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("languageHeading")}</h2>
          <p className="text-muted-foreground text-xs">
            {t("languageDescription")}
          </p>
        </header>
        <div className="p-4">
          <LanguageSettingsForm
            initialAppLanguage={appLanguage}
            initialWorkerLanguage={workerLanguage}
          />
        </div>
      </section>

      <section className="rounded-md border border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("communicationHeading")}</h2>
          <p className="text-muted-foreground text-xs">
            {t("communicationDescription")}
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

      <section className="rounded-md border border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("dnsHeading")}</h2>
          <p className="text-muted-foreground text-xs">{t("dnsDescription")}</p>
        </header>
        <div className="p-4">
          <EmailDnsCard
            initialDomain={data?.email_domain ?? ""}
            initialRecords={dnsRecords}
          />
        </div>
      </section>

      <section className="rounded-md border border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("accountingHeading")}</h2>
          <p className="text-muted-foreground text-xs">
            {t("accountingDescription")}
          </p>
        </header>
        <div className="p-4">
          <EconomicSettingsForm
            initialEnabled={data?.economic_enabled === true}
            initialJournalNumber={
              data?.economic_journal_number != null
                ? String(data.economic_journal_number)
                : ""
            }
            initialRevenueAccount={
              data?.economic_revenue_account != null
                ? String(data.economic_revenue_account)
                : ""
            }
            initialVatCode={data?.economic_vat_code ?? ""}
            initialCustomerGroup={
              data?.economic_customer_group != null
                ? String(data.economic_customer_group)
                : ""
            }
            initialVatZone={
              data?.economic_vat_zone != null
                ? String(data.economic_vat_zone)
                : ""
            }
            initialPaymentTerms={
              data?.economic_payment_terms != null
                ? String(data.economic_payment_terms)
                : ""
            }
            tokensReady={economicEnvReady()}
          />
        </div>
      </section>

      <section className="rounded-md border border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("purchasingHeading")}</h2>
          <p className="text-muted-foreground text-xs">
            {t("purchasingDescription")}
          </p>
        </header>
        <div className="p-4">
          <SettingsForm initialDefaultTransportPct={defaultTransportPct} />
        </div>
      </section>

    </div>
  );
}
