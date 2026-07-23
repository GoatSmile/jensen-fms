"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Logo } from "@/components/logo";
import { filterNavGroups, isNavItemActive } from "@/components/nav-items";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "jensen-fms:sidebar-collapsed";

export function AppSidebar({
  allowedCaps,
}: {
  /** Role capability scope; null = show everything (gate off / legacy). */
  allowedCaps: string[] | null;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const groups = filterNavGroups(allowedCaps);
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
          aria-label={t("logoAria")}
          className="flex items-center overflow-hidden"
        >
          <Logo heightClass={collapsed ? "h-8" : "h-12"} />
        </Link>
      </div>
      <TooltipProvider>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2">
          {groups.map((group, groupIndex) => (
            <Fragment key={groupIndex}>
              {groupIndex > 0 ? (
                <div
                  role="separator"
                  className="border-border/60 mx-2 my-1.5 border-t"
                />
              ) : null}
              {group.map((item) => {
                const Icon = item.icon;
                const label = t(item.labelKey);
                const active = isNavItemActive(item, pathname);
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={collapsed ? label : undefined}
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
                      <span className="truncate">{label}</span>
                    )}
                  </Link>
                );
                if (!collapsed) return link;
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
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
                aria-label={collapsed ? t("expandAria") : t("collapseAria")}
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
