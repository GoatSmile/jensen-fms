/**
 * Route-prefix → capability map — THE one place route gating is defined
 * (people & roles P2). Edge-safe (pure data), imported by middleware.
 * Nav filtering uses the `capability` field on nav-items directly; keep
 * the two in agreement when adding an app area.
 */
import type { Capability } from "./capabilities";

const ROUTE_CAPABILITIES: ReadonlyArray<readonly [string, Capability]> = [
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
 * Which capability a pathname needs, or null for unmapped routes (public
 * prefixes never reach this — middleware filters them first).
 */
export function routeCapability(pathname: string): Capability | null {
  if (pathname === "/") return "dashboard";
  for (const [prefix, cap] of ROUTE_CAPABILITIES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return cap;
  }
  return null;
}
