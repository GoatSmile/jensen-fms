import Link from "next/link";
import { Coins, Percent, Tag } from "lucide-react";

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

/**
 * Admin landing — tiles for each subsection. v1 holds two:
 *   - HS / TARIC codes (CRUD) — used by parts.hs_code_id and snapshotted
 *     onto PO lines at insert.
 *   - Settings — the default transport % applied to new PO lines.
 *
 * As more controlled-vocab tables grow (currencies, locations, segments,
 * etc.) they slot in here too.
 */
export default async function AdminLandingPage() {
  const supabase = await createClient();
  const [hsRes, settingsRes, fxRes] = await Promise.all([
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
  ]);

  const activeHsCount = hsRes.count ?? 0;
  const defaultTransportPct = Number(
    settingsRes.data?.default_transport_pct ?? 0.10,
  );
  const lastFxRefresh = fxRes.data?.rate_date as string | undefined;

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

      <div className="grid gap-4 sm:grid-cols-2">
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
            lastFxRefresh
              ? `Latest: ${lastFxRefresh}`
              : "No rates on file yet"
          }
        />
        <Tile
          href="/admin/settings"
          icon={Percent}
          title="Settings"
          description="App-wide defaults that PO line creation reads from."
          stat={`Default transport: ${formatPct(defaultTransportPct)}`}
        />
      </div>
    </div>
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
      className="hover:bg-muted/30 group flex flex-col gap-2 rounded-md border p-4 transition-colors"
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
