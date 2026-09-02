import Link from "next/link";
import {
  Coins,
  List,
  Mail,
  Map as MapIcon,
  Package,
  Percent,
  Truck,
  UserCog,
} from "lucide-react";

import { getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { VOCABULARIES } from "@/lib/admin/vocabularies";
import { createClient } from "@/lib/supabase/server";
import { formatPct } from "@/lib/parts/format";
import { cn } from "@/lib/utils";

/**
 * Admin landing — tiles for each subsection, grouped by domain (catalog &
 * inventory, purchasing & landed cost, customers, system) with the lists you
 * touch most near the top. The customer Map is reachable here too; it was
 * pulled out of the primary nav in June and put back under the Customers
 * group by the 2026-07-26 seven-group refresh, so both entry points are
 * deliberate.
 */
export default async function AdminLandingPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminHome"),
    getTranslations("common"),
  ]);
  // The six per-vocabulary counts that fed the retired tiles are gone with them —
  // one "Lists" tile replaces all six, and its stat comes from the descriptor
  // array rather than six round-trips this page no longer needs.
  const [
    settingsRes,
    fxRes,
    suppliersRes,
    kitsRes,
    orgsRes,
    priceListsRes,
    peopleRes,
    rolesRes,
    failedSendsRes,
  ] = await Promise.all([
    supabase
      .from("app_settings")
      .select("default_transport_pct")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("fx_rates")
      .select("rate_date")
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .is("deleted_at", null),
    supabase
      .from("kits")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("service_price_lists")
      .select("id", { count: "exact", head: true })
      .eq("is_current", true),
    supabase
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("roles")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    // Failures are the reason this tile carries a number at all.
    supabase
      .from("outbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  const defaultTransportPct = Number(
    settingsRes.data?.default_transport_pct ?? 0.10,
  );
  const lastFxRefresh = fxRes.data?.rate_date as string | undefined;
  const activeSupplierCount = suppliersRes.count ?? 0;
  const activeKitCount = kitsRes.count ?? 0;
  const customerCount = orgsRes.count ?? 0;
  const currentPriceListCount = priceListsRes.count ?? 0;
  const activePeopleCount = peopleRes.count ?? 0;
  const activeRoleCount = rolesRes.count ?? 0;
  const failedSendCount = failedSendsRes.count ?? 0;

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
            <BreadcrumbPage>{t("crumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminGroup
          title={t("groupCatalog")}
          tint="bg-brand-wash"
        >
          {/* One tile for all seven vocabularies. It sits in Catalog because most
              of them are catalog data, and its description names the two that
              are not (HS codes, customer segments) so retiring the Purchasing
              and Customers tiles doesn't hide them. */}
          <Tile
            href="/admin/lists"
            icon={List}
            title={t("listsTitle")}
            description={t("listsDesc")}
            stat={t("listsStat", { count: VOCABULARIES.length })}
          />
          <Tile
            href="/admin/kits"
            icon={Package}
            title={t("kitsTitle")}
            description={t("kitsDesc")}
            stat={t("kitsStat", { count: activeKitCount })}
          />
        </AdminGroup>

        <AdminGroup
          title={t("groupPurchasing")}
          tint="bg-buy-wash"
        >
          <Tile
            href="/admin/suppliers"
            icon={Truck}
            title={t("suppliersTitle")}
            description={t("suppliersDesc")}
            stat={t("suppliersStat", { count: activeSupplierCount })}
          />
          <Tile
            href="/admin/fx-rates"
            icon={Coins}
            title={t("fxRatesTitle")}
            description={t("fxRatesDesc")}
            stat={
              lastFxRefresh
                ? t("fxRatesStatLatest", { date: lastFxRefresh })
                : t("fxRatesStatNone")
            }
          />
          <Tile
            href="/admin/services"
            icon={Percent}
            title={t("servicesTitle")}
            description={t("servicesDesc")}
            stat={t("servicesStat", { count: currentPriceListCount })}
          />
        </AdminGroup>

        <AdminGroup
          title={t("groupCustomers")}
          tint="bg-good-wash"
        >
          <Tile
            href="/organizations/map"
            icon={MapIcon}
            title={t("mapTitle")}
            description={t("mapDesc")}
            stat={t("mapStat", { count: customerCount })}
          />
        </AdminGroup>

        <AdminGroup
          title={t("groupSystem")}
          tint="bg-system-wash"
        >
          <Tile
            href="/admin/people"
            icon={UserCog}
            title={t("peopleTitle")}
            description={t("peopleDesc")}
            stat={t("peopleStat", {
              people: activePeopleCount,
              roles: activeRoleCount,
            })}
          />
          <Tile
            href="/admin/outbox"
            icon={Mail}
            title={t("outboxTitle")}
            description={t("outboxDesc")}
            stat={
              failedSendCount > 0
                ? t("outboxStatFailed", { count: failedSendCount })
                : t("outboxStatClean")
            }
          />
          <Tile
            href="/admin/settings"
            icon={Percent}
            title={t("settingsTitle")}
            description={t("settingsDesc")}
            stat={t("settingsStat", { pct: formatPct(defaultTransportPct) })}
          />
        </AdminGroup>
      </div>
    </div>
  );
}

function AdminGroup({
  title,
  tint,
  children,
}: {
  title: string;
  /** Tailwind classes for the section's light tinted background + border. */
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border p-4", tint)}>
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Tile({
  href,
  icon: Icon,
  title,
  description,
  stat,
}: {
  href: string;
  icon: typeof List;
  title: string;
  description: string;
  stat: string;
}) {
  return (
    <Link
      href={href}
      className="bg-card hover:bg-muted/40 group flex flex-col gap-2 rounded-md border p-4 transition-colors"
    >
      <div className="flex items-start justify-between">
        <Icon className="text-muted-foreground size-5" aria-hidden />
        <span className="text-muted-foreground text-xs">{stat}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </div>
    </Link>
  );
}
