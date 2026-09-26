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
  ["/inbox", "inbox"],
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
