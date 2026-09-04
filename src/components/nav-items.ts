import {
  Bike,
  Boxes,
  Building2,
  ClipboardList,
  Home,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { Capability } from "@/lib/people/capabilities";

export type NavItem = {
  href: string;
  /** Key into the `nav` message namespace. */
  labelKey: string;
  /** Which role capability shows this item (people & roles P2). */
  capability: Capability;
  /** Match this route exactly (no prefix matching) — used for the root link. */
  exact?: boolean;
};

export type NavGroup = {
  /** Stable id — persisted in the `nav_open` cookie, so DO NOT rename. */
  id: string;
  /** Key into the `nav` message namespace. */
  labelKey: string;
  /** Shown as the group's marker, and as the whole group when collapsed. */
  icon: LucideIcon;
  /** A group with a single item is a plain link, not an expandable group. */
  items: NavItem[];
};

/**
 * Seven groups, set with the owner 2026-07-26 (was 14 flat items).
 *
 * Group names are CONCEPTS, not pages — "Orders" is what Dennis calls that
 * part of the job; "Purchase orders" is one route inside it. The shape also
 * stops the rail growing: CLAUDE.md fixes nav as per-service-type
 * permanently, so Paint becomes Paint + Wash + Prime as service types are
 * added. Flat that is a 15th, 16th, 17th line; grouped they are children and
 * the rail stays seven.
 *
 * Templates, families and kits stop being Admin — kits are a floor picking
 * aid and families group templates; neither is configuration. Nothing MOVES,
 * though: every href below already existed, so no URL or bookmark changes.
 *
 * Both navs render from here so the desktop sidebar and mobile drawer can't
 * drift.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "today",
    labelKey: "groupToday",
    icon: Home,
    items: [
      { href: "/", labelKey: "dashboard", capability: "dashboard", exact: true },
    ],
  },
  {
    id: "bikes",
    labelKey: "groupBikes",
    icon: Bike,
    items: [
      { href: "/bikes", labelKey: "allBikes", capability: "bikes" },
      {
        href: "/bike-templates",
        labelKey: "bikeTemplates",
        capability: "templates",
      },
      // Families' own route was retired into /admin/lists (2026-07-29). Pointed
      // straight at the tab rather than through the redirect. Known cost:
      // `pathMatches` compares pathname only, so on /admin/lists the ADMIN item
      // lights up, not this one — it already pointed into /admin/*, so the group
      // it lives in was always a label rather than a path.
      {
        href: "/admin/lists?vocab=families",
        labelKey: "families",
        capability: "templates",
      },
    ],
  },
  {
    id: "parts",
    labelKey: "groupParts",
    icon: Boxes,
    items: [
      { href: "/parts", labelKey: "allParts", capability: "parts" },
      {
        href: "/parts/stock-value",
        labelKey: "stockValue",
        capability: "parts",
      },
      { href: "/parts/painted", labelKey: "paintedStock", capability: "parts" },
      { href: "/admin/kits", labelKey: "kits", capability: "parts" },
    ],
  },
  {
    id: "work",
    labelKey: "groupWork",
    icon: Wrench,
    items: [
      {
        href: "/maintenance/tickets",
        labelKey: "tickets",
        capability: "maintenance",
      },
      {
        href: "/maintenance/work-orders",
        labelKey: "workOrders",
        capability: "maintenance",
      },
      { href: "/work", labelKey: "workshopFloor", capability: "work" },
      { href: "/inbox", labelKey: "inbox", capability: "inbox" },
    ],
  },
  {
    id: "orders",
    labelKey: "groupOrders",
    icon: ClipboardList,
    // ORDERED BY THE LIFE OF A JOB, because that is the only order a reader can
    // predict: quote it, sell it, PAINT it, build it, bill it.
    //
    // PAINT SITS ABOVE MANUFACTURING (owner, 2026-09-04) — this is the shop's
    // real sequence, not a quibble. Frames go to the painter and come back
    // before anything is assembled, which the code already enforces: paint's
    // service type is `blocks_build`, a bike at the painter cannot be finished,
    // and a build picks the PAINTED variant off the shelf. Listing
    // manufacturing first described the paperwork (an MO offers to spawn the
    // paint order) rather than the work, and the paperwork is not what Dennis
    // is navigating by.
    //
    // Purchase orders come last because they are the one document NOT on that
    // chain: supplier-side, continuous, and tied to stock rather than to any
    // customer's job. Alphabetical or by-frequency would both split the chain,
    // and the chain is the thing worth being able to read off the rail.
    items: [
      // Same `so` capability as sales orders: whoever sells, quotes.
      { href: "/offers", labelKey: "offers", capability: "so" },
      { href: "/sales-orders", labelKey: "salesOrders", capability: "so" },
      { href: "/paint-orders", labelKey: "paintOrders", capability: "paint" },
      {
        href: "/manufacturing-orders",
        labelKey: "manufacturingOrders",
        capability: "mo",
      },
      { href: "/invoices", labelKey: "invoices", capability: "invoices" },
      {
        href: "/purchase-orders",
        labelKey: "purchaseOrders",
        capability: "po",
      },
    ],
  },
  {
    id: "customers",
    labelKey: "groupCustomers",
    icon: Building2,
    items: [
      {
        href: "/organizations",
        labelKey: "allCustomers",
        capability: "customers",
      },
      {
        href: "/service-agreements",
        labelKey: "serviceAgreements",
        capability: "agreements",
      },
      {
        href: "/organizations/map",
        labelKey: "customerMap",
        capability: "customers",
      },
    ],
  },
  {
    id: "admin",
    labelKey: "groupAdmin",
    icon: Settings,
    items: [{ href: "/admin", labelKey: "admin", capability: "admin" }],
  },
];

export const NAV_GROUP_IDS = NAV_GROUPS.map((g) => g.id);

/**
 * Scope the nav to a role's capabilities. `allowed = null` means nothing is
 * scoped (gate off / legacy full-access login) — the pre-P2 behaviour.
 * A group whose every child is filtered out disappears entirely.
 */
export function filterNavGroups(allowed: string[] | null): NavGroup[] {
  if (allowed === null) return NAV_GROUPS;
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.includes(item.capability)),
  })).filter((group) => group.items.length > 0);
}

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function pathMatches(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Route-active logic shared by both navs: LONGEST matching href wins.
 *
 * Grouping put parents and children side by side in the rail — `/parts` next
 * to `/parts/stock-value`, `/admin` next to `/admin/kits`, `/organizations`
 * next to `/organizations/map`. A plain prefix test would light up both. The
 * old code special-cased `/organizations` by hand; longest-match generalises
 * that, so adding a nested child later needs no new exception. Marking the
 * parents `exact` instead would have broken every detail page (`/parts/<id>`
 * must still highlight "All parts").
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (!pathMatches(item, pathname)) return false;
  const best = ALL_NAV_ITEMS.filter((i) => pathMatches(i, pathname)).reduce(
    (a, b) => (b.href.length > a.href.length ? b : a),
  );
  return best.href === item.href;
}

/** Does this group contain the current page? Drives the closed-group dot. */
export function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => isNavItemActive(item, pathname));
}
