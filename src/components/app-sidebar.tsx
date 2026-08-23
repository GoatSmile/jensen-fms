"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  CircleUser,
  LogOut,
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
import { logout } from "@/app/_actions/logout";
import { savePreferences } from "@/app/_actions/preferences";
import { cn } from "@/lib/utils";

export function AppSidebar({
  allowedCaps,
  showPersonChip,
  personName,
  initialCollapsed,
  initialOpenGroups,
}: {
  /** Role capability scope; null = show everything (gate off / legacy). */
  allowedCaps: string[] | null;
  /** Only role sessions carry a person identity (tap-your-name, P3). */
  showPersonChip: boolean;
  personName: string | null;
  /** Resolved server-side from the person's preferences — no hydration shift. */
  initialOpenGroups: Record<string, boolean>;
  /** The person's stored rail state, server-rendered for the same reason. */
  initialCollapsed: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const groups = filterNavGroups(allowedCaps);
  // Both preferences arrive from the server already resolved (they live on
  // the person now, migration 81), so the rail paints correctly on the FIRST
  // frame — the old localStorage read could only apply after mount, which
  // meant an expanded rail that snapped narrow on every full page load.
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpenGroups);
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
    const next = !collapsed;
    setCollapsed(next);
    void savePreferences({ navCollapsed: next });
  }
  function toggleGroup(id: string) {
    // Compute the next state and persist it HERE, not inside a setState
    // updater. React may batch or re-invoke an updater, and a write from one
    // is a side effect in a place that must stay pure — two toggles in a
    // single tick persisted only the first.
    //
    // Deliberately not a useEffect on `open` either: that fires on mount and
    // would freeze the current defaults into the record just by visiting a
    // page, so "open the group holding the current page" would never apply
    // again. Only a real toggle should write.
    const next = { ...open, [id]: !open[id] };
    setOpen(next);
    void savePreferences({ navOpen: { [id]: next[id] } });
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
            <>
              {/* Who you are — a label, not a control. It used to be the
                  sign-out link itself, which read as a name and logged you
                  out when clicked. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "text-ink-2 flex w-full items-center gap-2.5 rounded-full py-1.5 text-sm",
                      collapsed ? "justify-center px-0" : "px-2.5",
                    )}
                  >
                    <CircleUser aria-hidden className="size-4 shrink-0" />
                    {collapsed ? null : (
                      <span className="truncate">{personName}</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" hidden={!collapsed}>
                  {personName}
                </TooltipContent>
              </Tooltip>
              {/* A form, not a link: Next prefetches links in the viewport,
                  and this one signs you out. */}
              <form action={logout}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="submit"
                      aria-label={t("signOutAria", { name: personName ?? "" })}
                      className={cn(
                        "text-ink-2 hover:bg-ink/5 hover:text-ink flex w-full items-center gap-2.5 rounded-full py-1.5 text-sm transition-colors",
                        collapsed ? "justify-center px-0" : "px-2.5",
                      )}
                    >
                      <LogOut aria-hidden className="size-4 shrink-0" />
                      {collapsed ? null : (
                        <span className="truncate">{t("signOut")}</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" hidden={!collapsed}>
                    {t("signOut")}
                  </TooltipContent>
                </Tooltip>
              </form>
            </>
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
