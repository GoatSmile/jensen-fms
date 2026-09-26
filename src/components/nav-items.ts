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
      // The fleet that existed before the system: bikes carrying an import
      // batch (migration 102). A filtered /bikes, not a route of its own.
      {
        href: "/bikes?origin=imported",
        labelKey: "importedBikes",
        capability: "bikes",
      },
      {
        href: "/bike-templates",
        labelKey: "bikeTemplates",
        capability: "templates",
      },
      // Families' own route was retired into /admin/lists (2026-07-29). Pointed
      // straight at the tab rather than through the redirect. Matching is
      // query-aware, so this item (not Admin) lights up on that tab.
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

/** The current URL's query — a string, or anything with URLSearchParams' `get`. */
type Search = string | { get(name: string): string | null };

function readSearch(search: Search): { get(name: string): string | null } {
  return typeof search === "string" ? new URLSearchParams(search) : search;
}

/** An href is a path plus, for a filtered view, the query pairs it requires. */
function splitHref(href: string): { path: string; query: [string, string][] } {
  const [path, qs = ""] = href.split("?");
  return { path, query: [...new URLSearchParams(qs).entries()] };
}

function pathMatches(
  item: NavItem,
  pathname: string,
  search: { get(name: string): string | null },
): boolean {
  const { path, query } = splitHref(item.href);
  // A filtered view (`/bikes?origin=imported`) is that one page carrying those
  // params — never its detail pages, which belong to the unfiltered parent.
  if (query.length > 0) {
    return pathname === path && query.every(([k, v]) => search.get(k) === v);
  }
  if (item.exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Longer paths are more specific, and a required query beats any path. */
function specificity(item: NavItem): number {
  const { path, query } = splitHref(item.href);
  return path.length + query.length * 1000;
}

/**
 * Route-active logic shared by both navs: the MOST SPECIFIC matching item wins.
 *
 * Grouping put parents and children side by side in the rail — `/parts` next
 * to `/parts/stock-value`, `/admin` next to `/admin/kits`, `/organizations`
 * next to `/organizations/map`. A plain prefix test would light up both. The
 * old code special-cased `/organizations` by hand; longest-match generalises
 * that, so adding a nested child later needs no new exception. Marking the
 * parents `exact` instead would have broken every detail page (`/parts/<id>`
 * must still highlight "All parts").
 *
 * Query-aware since 2026-09-26: an item whose href carries a query ("Imported
 * bikes" = `/bikes?origin=imported`, "Families" = `/admin/lists?vocab=families`)
 * matches only when the URL has those params, and then outranks the plain path.
 * Before this, Families could never light up — `/admin` did instead.
 */
export function isNavItemActive(
  item: NavItem,
  pathname: string,
  search: Search = "",
): boolean {
  const params = readSearch(search);
  if (!pathMatches(item, pathname, params)) return false;
  const best = ALL_NAV_ITEMS.filter((i) =>
    pathMatches(i, pathname, params),
  ).reduce((a, b) => (specificity(b) > specificity(a) ? b : a));
  return best.href === item.href;
}

/** Does this group contain the current page? Drives the closed-group dot. */
export function isGroupActive(
  group: NavGroup,
  pathname: string,
  search: Search = "",
): boolean {
  return group.items.some((item) => isNavItemActive(item, pathname, search));
}
