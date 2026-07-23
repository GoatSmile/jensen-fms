import Link from "next/link";
import {
  Coins,
  FolderTree,
  Layers,
  Map as MapIcon,
  Package,
  Palette,
  Percent,
  Tag,
  Truck,
  UserCog,
  Users,
  Warehouse,
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
import { createClient } from "@/lib/supabase/server";
import { formatPct } from "@/lib/parts/format";
import { cn } from "@/lib/utils";

/**
 * Admin landing — tiles for each subsection, grouped by domain (catalog &
 * inventory, purchasing & landed cost, customers, system) with the lists you
 * touch most near the top. The customer Map lives here too (moved out of the
 * primary nav).
 */
export default async function AdminLandingPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminHome"),
    getTranslations("common"),
  ]);
  const [
    hsRes,
    settingsRes,
    fxRes,
    colorsRes,
    segmentsRes,
    suppliersRes,
    kitsRes,
    categoriesRes,
    locationsRes,
    familiesRes,
    orgsRes,
    priceListsRes,
    peopleRes,
    rolesRes,
  ] = await Promise.all([
    supabase
      .from("hs_codes")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
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
      .from("colors")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("customer_segments")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
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
      .from("part_categories")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .is("deleted_at", null),
    supabase
      .from("inventory_locations")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("bike_families")
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
  ]);

  const activeHsCount = hsRes.count ?? 0;
  const defaultTransportPct = Number(
    settingsRes.data?.default_transport_pct ?? 0.10,
  );
  const lastFxRefresh = fxRes.data?.rate_date as string | undefined;
  const activeColorCount = colorsRes.count ?? 0;
  const activeSegmentCount = segmentsRes.count ?? 0;
  const activeSupplierCount = suppliersRes.count ?? 0;
  const activeKitCount = kitsRes.count ?? 0;
  const activeCategoryCount = categoriesRes.count ?? 0;
  const activeLocationCount = locationsRes.count ?? 0;
  const activeFamilyCount = familiesRes.count ?? 0;
  const customerCount = orgsRes.count ?? 0;
  const currentPriceListCount = priceListsRes.count ?? 0;
  const activePeopleCount = peopleRes.count ?? 0;
  const activeRoleCount = rolesRes.count ?? 0;

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
          tint="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20"
        >
          <Tile
            href="/admin/categories"
            icon={FolderTree}
            title={t("categoriesTitle")}
            description={t("categoriesDesc")}
            stat={t("categoriesStat", { count: activeCategoryCount })}
          />
          <Tile
            href="/admin/colors"
            icon={Palette}
            title={t("coloursTitle")}
            description={t("coloursDesc")}
            stat={t("coloursStat", { count: activeColorCount })}
          />
          <Tile
            href="/admin/families"
            icon={Layers}
            title={t("familiesTitle")}
            description={t("familiesDesc")}
            stat={t("familiesStat", { count: activeFamilyCount })}
          />
          <Tile
            href="/admin/kits"
            icon={Package}
            title={t("kitsTitle")}
            description={t("kitsDesc")}
            stat={t("kitsStat", { count: activeKitCount })}
          />
          <Tile
            href="/admin/locations"
            icon={Warehouse}
            title={t("locationsTitle")}
            description={t("locationsDesc")}
            stat={t("locationsStat", { count: activeLocationCount })}
          />
        </AdminGroup>

        <AdminGroup
          title={t("groupPurchasing")}
          tint="border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20"
        >
          <Tile
            href="/admin/suppliers"
            icon={Truck}
            title={t("suppliersTitle")}
            description={t("suppliersDesc")}
            stat={t("suppliersStat", { count: activeSupplierCount })}
          />
          <Tile
            href="/admin/hs-codes"
            icon={Tag}
            title={t("hsCodesTitle")}
            description={t("hsCodesDesc")}
            stat={t("hsCodesStat", { count: activeHsCount })}
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
          tint="border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
        >
          <Tile
            href="/admin/customer-segments"
            icon={Users}
            title={t("segmentsTitle")}
            description={t("segmentsDesc")}
            stat={t("segmentsStat", { count: activeSegmentCount })}
          />
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
          tint="border-violet-200/70 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20"
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
  icon: typeof Tag;
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
