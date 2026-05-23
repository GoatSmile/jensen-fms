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

import CustomerMap, {
  type CustomerPin,
} from "./_components/customer-map";

// Leaflet's runtime imports live inside useEffect in the client
// component, so a plain import here is SSR-safe — the wrapper SSRs
// to a stub `<div>` and the map mounts on the client.
export const dynamic = "force-dynamic";

/**
 * World map of customers, sized by bikes-in-service and coloured by
 * service-agreement coverage. Pins come from organisations that have
 * been geocoded — the Nominatim hook in save-organization populates
 * latitude/longitude in the background whenever an address is saved.
 *
 * v1 simplification on "SA bikes": if an organisation has ANY active
 * service agreement, all of its in-service bikes count as covered. If
 * we ever ship per-bike opt-in coverage, the query here changes; the
 * UI just renders whatever count comes back.
 */
export default async function CustomerMapPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [orgsRes, bikesRes, saRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        `id, legal_name, display_name_da, display_name_en,
         city, country_code, latitude, longitude,
         segment:customer_segments(id, slug, name_en)`,
      )
      .is("deleted_at", null)
      .eq("is_active", true)
      .not("latitude", "is", null)
      .not("longitude", "is", null),
    // All in-service bikes grouped by owner. We exclude terminal-state
    // bikes (retired, lost) since they're not "in service" for the
    // purposes of the map count.
    supabase
      .from("bikes")
      .select("owner_organization_id, status")
      .is("deleted_at", null)
      .not("owner_organization_id", "is", null)
      .not("status", "in", "(retired,lost_or_stolen)"),
    // Active service agreements — used as a per-org boolean for now.
    supabase
      .from("service_agreements")
      .select("organization_id, start_date, end_date, status")
      .eq("status", "active")
      .lte("start_date", today),
  ]);

  if (orgsRes.error) {
    throw new Error(`Failed to load customers: ${orgsRes.error.message}`);
  }

  // Tally bikes per org so the pin radius can scale with the count.
  const bikesByOrg = new Map<string, number>();
  for (const b of bikesRes.data ?? []) {
    if (!b.owner_organization_id) continue;
    bikesByOrg.set(
      b.owner_organization_id,
      (bikesByOrg.get(b.owner_organization_id) ?? 0) + 1,
    );
  }

  // Set of orgs covered by an active service agreement (handling NULL
  // end_date and end_date >= today in JS rather than fighting Supabase's
  // .or() builder).
  const orgsWithActiveSA = new Set<string>();
  for (const sa of saRes.data ?? []) {
    if (!sa.organization_id) continue;
    if (sa.end_date && sa.end_date < today) continue;
    orgsWithActiveSA.add(sa.organization_id);
  }

  const pins: CustomerPin[] = (orgsRes.data ?? [])
    .map((o) => {
      const lat = o.latitude == null ? null : Number(o.latitude);
      const lng = o.longitude == null ? null : Number(o.longitude);
      if (lat == null || lng == null) return null;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const bikes = bikesByOrg.get(o.id) ?? 0;
      const saBikes = orgsWithActiveSA.has(o.id) ? bikes : 0;
      const name = o.display_name_da ?? o.display_name_en ?? o.legal_name;
      return {
        id: o.id,
        name,
        city: o.city,
        countryCode: o.country_code,
        segmentSlug: o.segment?.slug ?? null,
        segmentLabel: o.segment?.name_en ?? null,
        bikes,
        saBikes,
        latitude: lat,
        longitude: lng,
      } satisfies CustomerPin;
    })
    .filter((p): p is CustomerPin => p !== null);

  // Build the segment filter chips from the segments that are actually
  // represented in the pin set. The "All" chip is always first.
  const segmentChips = [
    { id: "all", label: "All" },
    ...Array.from(
      new Map(
        pins
          .filter((p) => p.segmentSlug)
          .map((p) => [
            p.segmentSlug as string,
            { id: p.segmentSlug as string, label: p.segmentLabel ?? p.segmentSlug ?? "—" },
          ]),
      ).values(),
    ).sort((a, b) => a.label.localeCompare(b.label)),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b px-4 py-2.5 sm:px-6">
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
                <Link href="/organizations">Customers</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Map</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <CustomerMap pins={pins} segments={segmentChips} />
    </div>
  );
}
