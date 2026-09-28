/**
 * Capability registry — the provider-registry doctrine applied to
 * permissions: `role_capabilities` rows may only grant keys listed here,
 * because a capability only means something once code enforces it (nav
 * filtering, route gating, dashboard bands — arriving with role login, P2).
 *
 * One capability = one app area, coarse by design — with ONE exception,
 * `costs`, which is not an area but the right to see money: costs, prices,
 * margins, stock value. It superseded the 2026-07 "no field-level redaction —
 * workshop sees costs" rule (owner, 2026-09-26: technicians see no money).
 * `costs` gates the money on the screens a technician uses (parts, a bike,
 * the floor, the build workbench); areas whose job IS money (invoices, orders,
 * the dashboard, the office ticket/WO pages) show it to whoever may open them.
 *
 * A second exception, `templates_edit` (migration 104): `templates` opens the
 * template pages, and this one lets its holder CHANGE them — create, edit,
 * version, duplicate, delete. Owner, 2026-09-15: only Dennis creates
 * templates; Sales still reads them to price an offer.
 *
 * Keys line up with the shared nav (src/components/nav-items.ts);
 * `navLabelKey` points into the `nav` message namespace so the admin
 * checkboxes reuse the exact nav wording. A capability without a nav item
 * carries its own label in `adminPeople` (`adminLabelKey`).
 */
export const CAPABILITIES = [
  { key: "dashboard", navLabelKey: "dashboard" },
  { key: "bikes", navLabelKey: "bikes" },
  { key: "templates", navLabelKey: "bikeTemplates" },
  { key: "templates_edit", navLabelKey: null, adminLabelKey: "capTemplatesEdit" },
  { key: "parts", navLabelKey: "parts" },
  { key: "maintenance", navLabelKey: "maintenance" },
  { key: "inbox", navLabelKey: "inbox" },
  { key: "work", navLabelKey: "workshopFloor" },
  { key: "scan", navLabelKey: null, adminLabelKey: "capScan" },
  { key: "mo", navLabelKey: "manufacturingOrders" },
  { key: "po", navLabelKey: "purchaseOrders" },
  { key: "so", navLabelKey: "salesOrders" },
  { key: "paint", navLabelKey: "paintOrders" },
  { key: "invoices", navLabelKey: "invoices" },
  { key: "agreements", navLabelKey: "serviceAgreements" },
  { key: "customers", navLabelKey: "customers" },
  { key: "admin", navLabelKey: "admin" },
  { key: "costs", navLabelKey: null, adminLabelKey: "capCosts" },
  // The scheduled jobs page (/admin/jobs, migration 109) — system internals an
  // IT person watches; hidden from everyone without it.
  { key: "jobs", navLabelKey: null, adminLabelKey: "capJobs" },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["key"];

export const ALL_CAPABILITIES = CAPABILITIES.map(
  (c) => c.key,
) as readonly Capability[];

export function isCapability(value: string): value is Capability {
  return (ALL_CAPABILITIES as readonly string[]).includes(value);
}
