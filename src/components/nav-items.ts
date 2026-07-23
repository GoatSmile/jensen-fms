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

import type { Capability } from "@/lib/people/capabilities";

export type NavItem = {
  href: string;
  /** Key into the `nav` message namespace. */
  labelKey: string;
  icon: LucideIcon;
  /** Which role capability shows this item (people & roles P2). */
  capability: Capability;
  /** Match this route exactly (no prefix matching) — used for the root link. */
  exact?: boolean;
};

// Grouped nav, shared by the desktop sidebar and the mobile drawer so the
// two can't drift. Separators render between groups. Order set with the
// owner (2026-06-20): Dashboard alone at the top, then daily ops, then the
// commercial/orders flow, then Admin. The customer Map lives under Admin,
// so it's not here.
export const NAV_GROUPS: NavItem[][] = [
  [
    {
      href: "/",
      labelKey: "dashboard",
      icon: Home,
      capability: "dashboard",
      exact: true,
    },
  ],
  [
    { href: "/bikes", labelKey: "bikes", icon: Bike, capability: "bikes" },
    {
      href: "/bike-templates",
      labelKey: "bikeTemplates",
      icon: BookOpen,
      capability: "templates",
    },
    { href: "/parts", labelKey: "parts", icon: Boxes, capability: "parts" },
    {
      href: "/maintenance/tickets",
      labelKey: "maintenance",
      icon: Wrench,
      capability: "maintenance",
    },
    // Inbound-message review queue (voicemail → ticket; more channels later).
    // Sits by Maintenance because it feeds it.
    { href: "/inbox", labelKey: "inbox", icon: Inbox, capability: "inbox" },
    {
      href: "/work",
      labelKey: "workshopFloor",
      icon: HardHat,
      capability: "work",
    },
  ],
  [
    {
      href: "/manufacturing-orders",
      labelKey: "manufacturingOrders",
      icon: Hammer,
      capability: "mo",
    },
    {
      href: "/purchase-orders",
      labelKey: "purchaseOrders",
      icon: ClipboardList,
      capability: "po",
    },
    {
      href: "/sales-orders",
      labelKey: "salesOrders",
      icon: Receipt,
      capability: "so",
    },
    {
      href: "/paint-orders",
      labelKey: "paintOrders",
      icon: Paintbrush,
      capability: "paint",
    },
    {
      href: "/invoices",
      labelKey: "invoices",
      icon: FileText,
      capability: "invoices",
    },
    {
      href: "/service-agreements",
      labelKey: "serviceAgreements",
      icon: ShieldCheck,
      capability: "agreements",
    },
    {
      href: "/organizations",
      labelKey: "customers",
      icon: Building2,
      capability: "customers",
    },
  ],
  [
    {
      href: "/admin",
      labelKey: "admin",
      icon: Settings,
      capability: "admin",
    },
  ],
];

/**
 * Scope the nav to a role's capabilities. `allowed = null` means nothing is
 * scoped (gate off / legacy full-access login) — the pre-P2 behaviour.
 * Groups that end up empty disappear along with their separator.
 */
export function filterNavGroups(allowed: string[] | null): NavItem[][] {
  if (allowed === null) return NAV_GROUPS;
  return NAV_GROUPS.map((group) =>
    group.filter((item) => allowed.includes(item.capability)),
  ).filter((group) => group.length > 0);
}

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
