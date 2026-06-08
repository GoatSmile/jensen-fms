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
  // Agreements ending within 90 days count as "expiring soon" — the
  // prospecting/renewal signal on the map.
  const soonCutoff = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [orgsRes, unitsRes, bikesRes, saRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        `id, legal_name, display_name_da, display_name_en, lifecycle_stage,
         city, country_code, latitude, longitude,
         segment:customer_segments(id, slug, name_en)`,
      )
      .is("deleted_at", null)
      .eq("is_active", true)
      .not("latitude", "is", null)
      .not("longitude", "is", null),
    // Geocoded org units (kommune/hospital departments). Segment is
    // inherited from the parent org since units have no segment of their own.
    supabase
      .from("organization_units")
      .select(
        `id, name, city, country_code, latitude, longitude,
         organization:organizations(legal_name, display_name_da, display_name_en,
           segment:customer_segments(slug, name_en))`,
      )
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null),
    // All in-service bikes grouped by owner (org and unit). We exclude
    // terminal-state bikes (retired, lost) since they're not "in service".
    supabase
      .from("bikes")
      .select("owner_organization_id, owner_unit_id, status")
      .is("deleted_at", null)
      .not("status", "in", "(retired,lost_or_stolen)"),
    // Active service agreements — per-org coverage boolean + expiry signal.
    supabase
      .from("service_agreements")
      .select("organization_id, start_date, end_date, status")
      .eq("status", "active")
      .lte("start_date", today),
  ]);

  if (orgsRes.error) {
    throw new Error(`Failed to load customers: ${orgsRes.error.message}`);
  }

  // Tally in-service bikes per org and per unit so pin radius scales.
  const bikesByOrg = new Map<string, number>();
  const bikesByUnit = new Map<string, number>();
  for (const b of bikesRes.data ?? []) {
    if (b.owner_organization_id)
      bikesByOrg.set(
        b.owner_organization_id,
        (bikesByOrg.get(b.owner_organization_id) ?? 0) + 1,
      );
    if (b.owner_unit_id)
      bikesByUnit.set(
        b.owner_unit_id,
        (bikesByUnit.get(b.owner_unit_id) ?? 0) + 1,
      );
  }

  // Orgs with an active SA (for coverage colour) and a subset whose SA
  // expires within the window (for the renewal layer).
  const orgsWithActiveSA = new Set<string>();
  const orgsExpiringSoon = new Set<string>();
  for (const sa of saRes.data ?? []) {
    if (!sa.organization_id) continue;
    if (sa.end_date && sa.end_date < today) continue;
    orgsWithActiveSA.add(sa.organization_id);
    if (sa.end_date && sa.end_date >= today && sa.end_date <= soonCutoff)
      orgsExpiringSoon.add(sa.organization_id);
  }

  const finiteCoord = (v: unknown) => {
    const n = v == null ? null : Number(v);
    return n != null && Number.isFinite(n) ? n : null;
  };

  const orgPins: CustomerPin[] = (orgsRes.data ?? [])
    .map((o): CustomerPin | null => {
      const lat = finiteCoord(o.latitude);
      const lng = finiteCoord(o.longitude);
      if (lat == null || lng == null) return null;
      const bikes = bikesByOrg.get(o.id) ?? 0;
      return {
        id: o.id,
        kind: o.lifecycle_stage === "prospect" ? "prospect" : "customer",
        name: o.display_name_da ?? o.display_name_en ?? o.legal_name,
        parentName: null,
        city: o.city,
        countryCode: o.country_code,
        segmentSlug: o.segment?.slug ?? null,
        segmentLabel: o.segment?.name_en ?? null,
        bikes,
        saBikes: orgsWithActiveSA.has(o.id) ? bikes : 0,
        expiringSoon: orgsExpiringSoon.has(o.id),
        latitude: lat,
        longitude: lng,
      } satisfies CustomerPin;
    })
    .filter((p): p is CustomerPin => p !== null);

  const unitPins: CustomerPin[] = (unitsRes.data ?? [])
    .map((u): CustomerPin | null => {
      const lat = finiteCoord(u.latitude);
      const lng = finiteCoord(u.longitude);
      if (lat == null || lng == null) return null;
      const org = Array.isArray(u.organization)
        ? u.organization[0]
        : u.organization;
      const seg = org?.segment
        ? Array.isArray(org.segment)
          ? org.segment[0]
          : org.segment
        : null;
      return {
        id: u.id,
        kind: "unit",
        name: u.name,
        parentName:
          org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? null,
        city: u.city,
        countryCode: u.country_code,
        segmentSlug: seg?.slug ?? null,
        segmentLabel: seg?.name_en ?? null,
        bikes: bikesByUnit.get(u.id) ?? 0,
        saBikes: 0,
        expiringSoon: false,
        latitude: lat,
        longitude: lng,
      } satisfies CustomerPin;
    })
    .filter((p): p is CustomerPin => p !== null);

  const pins: CustomerPin[] = [...orgPins, ...unitPins];

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
