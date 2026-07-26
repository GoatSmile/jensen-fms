"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  CircleUser,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { Logo } from "@/components/logo";
import {
  filterNavGroups,
  isGroupActive,
  isNavItemActive,
} from "@/components/nav-items";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  NAV_OPEN_COOKIE,
  NAV_OPEN_MAX_AGE,
  serializeOpenGroups,
  type OpenGroups,
} from "@/lib/nav/open-groups";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "jensen-fms:sidebar-collapsed";

export function AppSidebar({
  allowedCaps,
  showPersonChip,
  personName,
  initialOpenGroups,
}: {
  /** Role capability scope; null = show everything (gate off / legacy). */
  allowedCaps: string[] | null;
  /** Only role sessions carry a person identity (tap-your-name, P3). */
  showPersonChip: boolean;
  personName: string | null;
  /** Resolved server-side from the `nav_open` cookie — no hydration shift. */
  initialOpenGroups: OpenGroups;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const groups = filterNavGroups(allowedCaps);
  // Collapsed = icon-only rail with hover tooltips. SSR renders expanded;
  // the stored preference applies after mount (the sidebar lives in the
  // root layout, so this runs once per full page load, not per navigation).
  const [collapsed, setCollapsed] = useState(false);
  // Group state arrives from the server already resolved, so the rail paints
  // correctly on the first frame. Toggling updates local state AND the cookie.
  const [open, setOpen] = useState<OpenGroups>(initialOpenGroups);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only, so the stored preference is applied after mount (see above)
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  // Hide all workshop chrome on public-scan routes — those pages are
  // customer-facing and need a clean shell.
  if (
    pathname.startsWith("/b/") ||
    pathname.startsWith("/report/") ||
    pathname === "/login"
  ) {
    return null;
  }
  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }
  function toggleGroup(id: string) {
    // Compute the next state and persist it HERE, not inside a setState
    // updater. React may batch or re-invoke an updater, and writing a cookie
    // from one is a side effect in a place that must stay pure — two toggles
    // in a single tick persisted only the first.
    //
    // Deliberately not a useEffect on `open` either: that fires on mount and
    // would freeze the current defaults into the cookie just by visiting a
    // page, so "open the group holding the current page" would never apply
    // again. Only a real toggle should write.
    const next = { ...open, [id]: !open[id] };
    setOpen(next);
    document.cookie = `${NAV_OPEN_COOKIE}=${serializeOpenGroups(next)}; path=/; max-age=${NAV_OPEN_MAX_AGE}; samesite=lax`;
  }
  return (
    <aside
      className={cn(
        "bg-sidebar sticky top-0 hidden h-screen shrink-0 flex-col transition-[width] duration-200 md:flex print:hidden",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex h-20 items-center justify-center px-2">
        <Link
          href="/"
          aria-label={t("logoAria")}
          className="flex items-center overflow-hidden"
        >
          <Logo heightClass={collapsed ? "h-8" : "h-12"} />
        </Link>
      </div>
      <TooltipProvider>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2">
          {groups.map((group) => {
            const Icon = group.icon;
            const groupLabel = t(group.labelKey);
            const groupActive = isGroupActive(group, pathname);
            const single = group.items.length === 1;

            // Collapsed rail: one icon per group, linking to its first item.
            if (collapsed) {
              const target = group.items[0];
              return (
                <Tooltip key={group.id}>
                  <TooltipTrigger asChild>
                    <Link
                      href={target.href}
                      aria-label={groupLabel}
                      className={cn(
                        "flex items-center justify-center rounded-full py-1.5 transition-colors",
                        groupActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-ink-2 hover:bg-ink/5 hover:text-ink",
                      )}
                    >
                      <Icon aria-hidden className="size-4 shrink-0" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{groupLabel}</TooltipContent>
                </Tooltip>
              );
            }

            // A one-item group (Today, Admin) is a plain link, not a
            // disclosure — an expander hiding a single child is pure friction.
            if (single) {
              const item = group.items[0];
              const active = isNavItemActive(item, pathname);
              return (
                <Link
                  key={group.id}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-full px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-ink-2 hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{groupLabel}</span>
                </Link>
              );
            }

            const isOpen = open[group.id] ?? groupActive;
            return (
              <div key={group.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                  className={cn(
                    "text-ink-2 hover:bg-ink/5 hover:text-ink flex items-center gap-2.5 rounded-full px-2.5 py-1.5 text-sm transition-colors",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{groupLabel}</span>
                  {/* A closed group holding the current page keeps a dot, so
                      collapsing your working group never costs you your sense
                      of place. */}
                  {!isOpen && groupActive ? (
                    <span
                      className="bg-brand size-1.5 shrink-0 rounded-full"
                      aria-hidden
                    />
                  ) : null}
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "ml-auto size-3.5 shrink-0 transition-transform",
                      isOpen ? "rotate-90" : null,
                    )}
                  />
                </button>
                {isOpen ? (
                  <div className="mt-0.5 flex flex-col gap-0.5 pl-4">
                    {group.items.map((item) => {
                      const active = isNavItemActive(item, pathname);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "truncate rounded-full px-2.5 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-ink-2 hover:bg-ink/5 hover:text-ink",
                          )}
                        >
                          {t(item.labelKey)}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="p-2">
          {showPersonChip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/whoami"
                  aria-label={personName ?? t("whoami")}
                  className={cn(
                    "text-ink-2 hover:bg-ink/5 hover:text-ink flex w-full items-center gap-2.5 rounded-full py-1.5 text-sm transition-colors",
                    collapsed ? "justify-center px-0" : "px-2.5",
                  )}
                >
                  <CircleUser aria-hidden className="size-4 shrink-0" />
                  {collapsed ? null : (
                    <span className="truncate">
                      {personName ?? t("whoami")}
                    </span>
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" hidden={!collapsed}>
                {personName ?? t("whoami")}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={collapsed ? t("expandAria") : t("collapseAria")}
                className={cn(
                  "text-ink-2 hover:bg-ink/5 hover:text-ink flex w-full items-center gap-2.5 rounded-full py-1.5 text-sm transition-colors",
                  collapsed ? "justify-center px-0" : "px-2.5",
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen aria-hidden className="size-4 shrink-0" />
                ) : (
                  <>
                    <PanelLeftClose aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">{t("collapse")}</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" hidden={!collapsed}>
              {t("expandAria")}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}
