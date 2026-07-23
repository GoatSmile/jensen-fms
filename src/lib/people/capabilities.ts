/**
 * Capability registry — the provider-registry doctrine applied to
 * permissions: `role_capabilities` rows may only grant keys listed here,
 * because a capability only means something once code enforces it (nav
 * filtering, route gating, dashboard bands — arriving with role login, P2).
 *
 * One capability = one app area, coarse by design (locked with the owner:
 * no field-level redaction — workshop sees costs). Keys line up with the
 * shared nav (src/components/nav-items.ts); `navLabelKey` points into the
 * `nav` message namespace so the admin checkboxes reuse the exact nav
 * wording. `scan` has no nav item and carries its own label in
 * `adminPeople.capScan`.
 */
export const CAPABILITIES = [
  { key: "dashboard", navLabelKey: "dashboard" },
  { key: "bikes", navLabelKey: "bikes" },
  { key: "templates", navLabelKey: "bikeTemplates" },
  { key: "parts", navLabelKey: "parts" },
  { key: "maintenance", navLabelKey: "maintenance" },
  { key: "inbox", navLabelKey: "inbox" },
  { key: "work", navLabelKey: "workshopFloor" },
  { key: "scan", navLabelKey: null },
  { key: "mo", navLabelKey: "manufacturingOrders" },
  { key: "po", navLabelKey: "purchaseOrders" },
  { key: "so", navLabelKey: "salesOrders" },
  { key: "paint", navLabelKey: "paintOrders" },
  { key: "invoices", navLabelKey: "invoices" },
  { key: "agreements", navLabelKey: "serviceAgreements" },
  { key: "customers", navLabelKey: "customers" },
  { key: "admin", navLabelKey: "admin" },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["key"];

export const ALL_CAPABILITIES = CAPABILITIES.map(
  (c) => c.key,
) as readonly Capability[];

export function isCapability(value: string): value is Capability {
  return (ALL_CAPABILITIES as readonly string[]).includes(value);
}
