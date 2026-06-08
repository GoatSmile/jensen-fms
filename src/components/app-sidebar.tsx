"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bike,
  BookOpen,
  Boxes,
  Building2,
  ClipboardList,
  Hammer,
  HardHat,
  Home,
  Map as MapIcon,
  Paintbrush,
  Receipt,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match this route exactly (no prefix matching) — used for the root link. */
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home, exact: true },
  { href: "/parts", label: "Parts", icon: Boxes },
  { href: "/purchase-orders", label: "Purchase orders", icon: ClipboardList },
  { href: "/bike-templates", label: "Bike templates", icon: BookOpen },
  { href: "/bikes", label: "Bikes", icon: Bike },
  { href: "/maintenance/tickets", label: "Maintenance", icon: Wrench },
  { href: "/work", label: "Workshop floor", icon: HardHat },
  { href: "/organizations", label: "Customers", icon: Building2 },
  { href: "/organizations/map", label: "Map", icon: MapIcon },
  { href: "/sales-orders", label: "Sales orders", icon: Receipt },
  { href: "/manufacturing-orders", label: "Manufacturing orders", icon: Hammer },
  { href: "/paint-orders", label: "Paint orders", icon: Paintbrush },
  { href: "/admin", label: "Admin", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  // Hide all workshop chrome on public-scan routes — those pages are
  // customer-facing and need a clean shell.
  if (pathname.startsWith("/b/") || pathname.startsWith("/report/")) {
    return null;
  }
  return (
    <aside className="bg-muted/30 sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r md:flex">
      <div className="flex h-20 items-center justify-center border-b px-4">
        <Link
          href="/"
          aria-label="Jensen FMS — Dashboard"
          className="flex items-center"
        >
          <Logo heightClass="h-12" />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          // The Maintenance entry links to tickets but also owns work orders.
          // Highlight it for both sub-routes so the nav state reads correctly.
          const isMaintenanceItem = item.href === "/maintenance/tickets";
          // /organizations and /organizations/map are siblings — match
          // each exactly so the parent doesn't claim its child's
          // active state.
          const isCustomerListItem = item.href === "/organizations";
          const isCustomerMapItem = item.href === "/organizations/map";
          const active = item.exact
            ? pathname === item.href
            : isCustomerListItem
              ? pathname === item.href ||
                (pathname.startsWith(`${item.href}/`) &&
                  pathname !== "/organizations/map")
              : isCustomerMapItem
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`) ||
                  (isMaintenanceItem &&
                    pathname.startsWith("/maintenance/work-orders"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
