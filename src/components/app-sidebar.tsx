"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/logo";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match this route exactly (no prefix matching) — used for the root link. */
  exact?: boolean;
};

// Grouped nav. Separators render between groups. Order set with the owner
// (2026-06-20): Dashboard alone at the top, then daily ops, then the
// commercial/orders flow, then Admin. The customer Map moved into the Admin
// section, so it's no longer here.
const NAV_GROUPS: NavItem[][] = [
  [{ href: "/", label: "Dashboard", icon: Home, exact: true }],
  [
    { href: "/bikes", label: "Bikes", icon: Bike },
    { href: "/bike-templates", label: "Bike templates", icon: BookOpen },
    { href: "/parts", label: "Parts", icon: Boxes },
    { href: "/maintenance/tickets", label: "Maintenance", icon: Wrench },
    { href: "/work", label: "Workshop floor", icon: HardHat },
  ],
  [
    { href: "/manufacturing-orders", label: "Manufacturing orders", icon: Hammer },
    { href: "/purchase-orders", label: "Purchase orders", icon: ClipboardList },
    { href: "/sales-orders", label: "Sales orders", icon: Receipt },
    { href: "/paint-orders", label: "Paint orders", icon: Paintbrush },
    { href: "/invoices", label: "Invoices", icon: FileText },
    { href: "/service-agreements", label: "Service agreements", icon: ShieldCheck },
    { href: "/organizations", label: "Customers", icon: Building2 },
  ],
  [{ href: "/admin", label: "Admin", icon: Settings }],
];

const COLLAPSE_KEY = "jensen-fms:sidebar-collapsed";

export function AppSidebar() {
  const pathname = usePathname();
  // Collapsed = icon-only rail with hover tooltips. SSR renders expanded;
  // the stored preference applies after mount (the sidebar lives in the
  // root layout, so this runs once per full page load, not per navigation).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only, so the stored preference is applied after mount (see above)
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  // Hide all workshop chrome on public-scan routes — those pages are
  // customer-facing and need a clean shell.
  if (pathname.startsWith("/b/") || pathname.startsWith("/report/")) {
    return null;
  }
  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }
  return (
    <aside
      className={cn(
        "bg-muted/30 sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 md:flex print:hidden",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex h-20 items-center justify-center border-b px-2">
        <Link
          href="/"
          aria-label="Jensen FMS — Dashboard"
          className="flex items-center overflow-hidden"
        >
          <Logo heightClass={collapsed ? "h-8" : "h-12"} />
        </Link>
      </div>
      <TooltipProvider>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2">
          {NAV_GROUPS.map((group, groupIndex) => (
            <Fragment key={groupIndex}>
              {groupIndex > 0 ? (
                <div
                  role="separator"
                  className="border-border/60 mx-2 my-1.5 border-t"
                />
              ) : null}
              {group.map((item) => {
                const Icon = item.icon;
                // The Maintenance entry links to tickets but also owns work
                // orders. Highlight it for both sub-routes so the nav state
                // reads correctly.
                const isMaintenanceItem =
                  item.href === "/maintenance/tickets";
                // Customers (/organizations) shouldn't claim the customer map
                // (/organizations/map) — that now lives under Admin.
                const isCustomerListItem = item.href === "/organizations";
                const active = item.exact
                  ? pathname === item.href
                  : isCustomerListItem
                    ? pathname === item.href ||
                      (pathname.startsWith(`${item.href}/`) &&
                        pathname !== "/organizations/map")
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`) ||
                      (isMaintenanceItem &&
                        pathname.startsWith("/maintenance/work-orders"));
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
                      collapsed ? "justify-center px-0" : "px-2.5",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {collapsed ? null : (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                );
                if (!collapsed) return link;
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </Fragment>
          ))}
        </nav>
        <div className="border-t p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={
                  collapsed ? "Expand navigation" : "Collapse navigation"
                }
                className={cn(
                  "text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex w-full items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
                  collapsed ? "justify-center px-0" : "px-2.5",
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen aria-hidden className="size-4 shrink-0" />
                ) : (
                  <>
                    <PanelLeftClose aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">Collapse</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" hidden={!collapsed}>
              Expand navigation
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}
