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
  Users,
  Warehouse,
} from "lucide-react";

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
            <BreadcrumbPage>Admin</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted-foreground text-sm">
          Controlled-vocab lists and app-wide defaults. Edits here flow into
          new PO lines; existing snapshots stay frozen.
        </p>
      </header>

      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminGroup
          title="Catalog & inventory"
          tint="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20"
        >
          <Tile
            href="/admin/categories"
            icon={FolderTree}
            title="Part categories"
            description="The hierarchy parts are classified under. Every part carries one."
            stat={`${activeCategoryCount} active categor${activeCategoryCount === 1 ? "y" : "ies"}`}
          />
          <Tile
            href="/admin/colors"
            icon={Palette}
            title="Colours"
            description="Bike colours and finishes. Edits flow into new pickers; existing records keep their reference."
            stat={`${activeColorCount} active colour${activeColorCount === 1 ? "" : "s"}`}
          />
          <Tile
            href="/admin/families"
            icon={Layers}
            title="Families"
            description="Product families that group bike templates (e.g. Norma over its sizes) on the templates list."
            stat={`${activeFamilyCount} active famil${activeFamilyCount === 1 ? "y" : "ies"}`}
          />
          <Tile
            href="/admin/kits"
            icon={Package}
            title="Kits"
            description="Colour + number sticker labels for part boxes — the assembly floor picks complete part sets by code."
            stat={`${activeKitCount} active kit${activeKitCount === 1 ? "" : "s"}`}
          />
          <Tile
            href="/admin/locations"
            icon={Warehouse}
            title="Locations"
            description="Physical sites stock lives at. The primary location is the default for receiving and consumption."
            stat={`${activeLocationCount} active location${activeLocationCount === 1 ? "" : "s"}`}
          />
        </AdminGroup>

        <AdminGroup
          title="Purchasing & landed cost"
          tint="border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20"
        >
          <Tile
            href="/admin/suppliers"
            icon={Truck}
            title="Suppliers"
            description="Vendors parts are bought from. Used by part offerings, purchase orders, and paint orders."
            stat={`${activeSupplierCount} active supplier${activeSupplierCount === 1 ? "" : "s"}`}
          />
          <Tile
            href="/admin/hs-codes"
            icon={Tag}
            title="HS / TARIC codes"
            description="Classify parts so EU import duty rolls into the landed cost."
            stat={`${activeHsCount} active code${activeHsCount === 1 ? "" : "s"}`}
          />
          <Tile
            href="/admin/fx-rates"
            icon={Coins}
            title="FX rates"
            description="Currency-to-DKK conversion rates from ECB via Frankfurter."
            stat={
              lastFxRefresh ? `Latest: ${lastFxRefresh}` : "No rates on file yet"
            }
          />
          <Tile
            href="/admin/services"
            icon={Percent}
            title="Service price lists"
            description="Supplier-issued tiered prices for outsourced work (painting). A change is a new revision; sent orders stay frozen."
            stat={`${currentPriceListCount} current list${currentPriceListCount === 1 ? "" : "s"}`}
          />
        </AdminGroup>

        <AdminGroup
          title="Customers"
          tint="border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
        >
          <Tile
            href="/admin/customer-segments"
            icon={Users}
            title="Customer segments"
            description="Hotel / hospital / municipality / FM / B2B / B2C. Used to classify organisations and report on the customer mix."
            stat={`${activeSegmentCount} active segment${activeSegmentCount === 1 ? "" : "s"}`}
          />
          <Tile
            href="/organizations/map"
            icon={MapIcon}
            title="Map"
            description="Geocoded view of customers and prospects — a sales and routing aid."
            stat={`${customerCount} customer${customerCount === 1 ? "" : "s"}`}
          />
        </AdminGroup>

        <AdminGroup
          title="System"
          tint="border-violet-200/70 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20"
        >
          <Tile
            href="/admin/settings"
            icon={Percent}
            title="Settings"
            description="App-wide defaults (transport %, primary location, hide location info)."
            stat={`Default transport: ${formatPct(defaultTransportPct)}`}
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
