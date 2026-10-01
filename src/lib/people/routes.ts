/**
 * Route-prefix → capability map — THE one place route gating is defined
 * (people & roles P2). Edge-safe (pure data), imported by middleware.
 * Nav filtering uses the `capability` field on nav-items directly; keep
 * the two in agreement when adding an app area.
 */
import type { Capability } from "./capabilities";

const ROUTE_CAPABILITIES: ReadonlyArray<readonly [string, Capability]> = [
  // More specific prefixes first — the first match wins.
  // Stock value is nothing but money.
  ["/parts/stock-value", "costs"],
  // Kits live under /admin but are a floor picking aid (the nav shows them to
  // `parts`), and Glenn labels the boxes — so they open with `parts`.
  ["/admin/kits", "parts"],
  ["/bikes", "bikes"],
  ["/bike-templates", "templates"],
  ["/parts", "parts"],
  ["/maintenance", "maintenance"],
  // /inbox redirects to /calls (DECISIONS 2026-09-29); gated like it.
  ["/inbox", "inbox"],
  ["/commands", "inbox"],
  ["/work", "work"],
  ["/scan", "scan"],
  // QR sticker pages are bike surfaces (print sheets, single stickers).
  ["/qr", "bikes"],
  ["/manufacturing-orders", "mo"],
  ["/purchase-orders", "po"],
  ["/offers", "so"],
  ["/sales-orders", "so"],
  ["/paint-orders", "paint"],
  ["/invoices", "invoices"],
  ["/service-agreements", "agreements"],
  ["/organizations", "customers"],
  ["/admin", "admin"],
];

/**
 * The build floor lives under an MO's URL, but it is the WORKSHOP's screen:
 * `/work`'s *To build* links straight here. Gated on `mo` alone, a Workshop
 * user was bounced from their own queue (found 2026-09-26). These open with
 * either capability.
 */
const FLOOR_ROUTES: ReadonlyArray<RegExp> = [
  /^\/manufacturing-orders\/[^/]+\/bikes\/[^/]+\/build(\/|$)/,
  /^\/manufacturing-orders\/[^/]+\/build-batch(\/|$)/,
  /^\/manufacturing-orders\/[^/]+\/pick-list(\/|$)/,
];

/**
 * Part forms carry purchase and retail prices, and the CSV import writes them:
 * office work, so they need `costs` even though they sit under /parts, which a
 * technician may browse (owner, 2026-09-26).
 */
const COSTS_ROUTES: ReadonlyArray<RegExp> = [
  /^\/parts\/new(\/|$)/,
  /^\/parts\/import(\/|$)/,
  /^\/parts\/[^/]+\/edit(\/|$)/,
];

/**
 * Pages that exist only to CHANGE a template (migration 104). The detail page
 * stays on `templates` and hides its editors instead; every writer action
 * checks `templates_edit` itself, because middleware only sees page URLs.
 */
const TEMPLATE_EDIT_ROUTES: ReadonlyArray<RegExp> = [
  /^\/bike-templates\/new(\/|$)/,
  /^\/bike-templates\/[^/]+\/edit(\/|$)/,
];

/**
 * The capabilities that open a pathname — any one suffices — or null for
 * unmapped routes (public prefixes never reach this — middleware filters them
 * first).
 */
export function routeCapabilities(
  pathname: string,
): readonly Capability[] | null {
  if (pathname === "/") return ["dashboard"];
  if (FLOOR_ROUTES.some((re) => re.test(pathname))) return ["work", "mo"];
  if (COSTS_ROUTES.some((re) => re.test(pathname))) return ["costs"];
  if (TEMPLATE_EDIT_ROUTES.some((re) => re.test(pathname))) {
    return ["templates_edit"];
  }
  // Calls: every line with `inbox`, a technician's own with `calls_own`; the
  // page and every action narrow further by row (src/lib/calls/access.ts).
  if (pathname === "/calls" || pathname.startsWith("/calls/")) return ["inbox", "calls_own"];
  // The calendar (read-only; /visits redirects there): the office AND the
  // floor — the technician is the one driving to the visits (migration 117).
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) return ["maintenance", "work"];
  if (pathname === "/visits" || pathname.startsWith("/visits/")) return ["maintenance", "work"];
  // The scheduled jobs are their own capability, not `admin` (migration 109).
  if (pathname === "/admin/jobs" || pathname.startsWith("/admin/jobs/")) {
    return ["jobs"];
  }
  for (const [prefix, cap] of ROUTE_CAPABILITIES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return [cap];
  }
  return null;
}

/** May a session holding `caps` open `pathname`? */
export function routeAllows(pathname: string, caps: readonly string[]): boolean {
  const needed = routeCapabilities(pathname);
  return needed === null || needed.some((c) => caps.includes(c));
}
