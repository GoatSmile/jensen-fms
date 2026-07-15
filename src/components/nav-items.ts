import {
  Bike,
  BookOpen,
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  Hammer,
  HardHat,
  Home,
  Inbox,
  Paintbrush,
  Receipt,
  Settings,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  /** Key into the `nav` message namespace. */
  labelKey: string;
  icon: LucideIcon;
  /** Match this route exactly (no prefix matching) — used for the root link. */
  exact?: boolean;
};

// Grouped nav, shared by the desktop sidebar and the mobile drawer so the
// two can't drift. Separators render between groups. Order set with the
// owner (2026-06-20): Dashboard alone at the top, then daily ops, then the
// commercial/orders flow, then Admin. The customer Map lives under Admin,
// so it's not here.
export const NAV_GROUPS: NavItem[][] = [
  [{ href: "/", labelKey: "dashboard", icon: Home, exact: true }],
  [
    { href: "/bikes", labelKey: "bikes", icon: Bike },
    { href: "/bike-templates", labelKey: "bikeTemplates", icon: BookOpen },
    { href: "/parts", labelKey: "parts", icon: Boxes },
    { href: "/maintenance/tickets", labelKey: "maintenance", icon: Wrench },
    // Inbound-message review queue (voicemail → ticket; more channels later).
    // Sits by Maintenance because it feeds it.
    { href: "/inbox", labelKey: "inbox", icon: Inbox },
    { href: "/work", labelKey: "workshopFloor", icon: HardHat },
  ],
  [
    {
      href: "/manufacturing-orders",
      labelKey: "manufacturingOrders",
      icon: Hammer,
    },
    { href: "/purchase-orders", labelKey: "purchaseOrders", icon: ClipboardList },
    { href: "/sales-orders", labelKey: "salesOrders", icon: Receipt },
    { href: "/paint-orders", labelKey: "paintOrders", icon: Paintbrush },
    { href: "/invoices", labelKey: "invoices", icon: FileText },
    {
      href: "/service-agreements",
      labelKey: "serviceAgreements",
      icon: ShieldCheck,
    },
    { href: "/organizations", labelKey: "customers", icon: Building2 },
  ],
  [{ href: "/admin", labelKey: "admin", icon: Settings }],
];

/**
 * Route-active logic shared by both navs. The Maintenance entry links to
 * tickets but also owns work orders; Customers (/organizations) shouldn't
 * claim the customer map (/organizations/map), which lives under Admin.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  if (item.href === "/organizations") {
    return (
      pathname === item.href ||
      (pathname.startsWith(`${item.href}/`) &&
        pathname !== "/organizations/map")
    );
  }
  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    (item.href === "/maintenance/tickets" &&
      pathname.startsWith("/maintenance/work-orders"))
  );
}
