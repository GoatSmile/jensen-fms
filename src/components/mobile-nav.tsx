"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CircleUser, Menu, X } from "lucide-react";

import { Logo, LogoMark } from "@/components/logo";
import { filterNavGroups, isNavItemActive } from "@/components/nav-items";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Mobile top bar with a hamburger drawer — shown only below md. Desktop uses
 * the persistent sidebar. No shadcn Sheet primitive is installed, so this is
 * a radix Dialog rendered as a full-height left drawer (we use the radix
 * primitives directly so we can ditch the centred-modal styles that
 * shadcn's DialogContent applies).
 */
export function MobileNav({
  allowedCaps,
  showPersonChip,
  personName,
}: {
  /** Role capability scope; null = show everything (gate off / legacy). */
  allowedCaps: string[] | null;
  /** Only role sessions carry a person identity (tap-your-name, P3). */
  showPersonChip: boolean;
  personName: string | null;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = filterNavGroups(allowedCaps);

  // Close the drawer when the route changes — clicking a nav link navigates,
  // and the dialog state needs to follow.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing drawer state to navigation (close on route change)
    setOpen(false);
  }, [pathname]);

  // Hide on public-scan routes — those pages are customer-facing and
  // shouldn't expose the workshop nav.
  if (
    pathname.startsWith("/b/") ||
    pathname.startsWith("/report/") ||
    pathname === "/login"
  ) {
    return null;
  }

  return (
    <header className="bg-background sticky top-0 z-30 flex h-12 items-center justify-between border-b px-3 md:hidden print:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("openAria")}>
            <Menu aria-hidden />
          </Button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 z-40 bg-black/30",
              "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
              "duration-150",
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              "bg-background ring-foreground/10 fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col outline-none ring-1",
              "data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left",
              "duration-150",
            )}
          >
            <DialogPrimitive.Title className="sr-only">
              {t("title")}
            </DialogPrimitive.Title>
            <div className="flex h-20 items-center justify-between border-b px-4">
              <Link
                href="/"
                aria-label={t("logoAria")}
                className="flex items-center"
              >
                <Logo heightClass="h-12" />
              </Link>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("closeAria")}
                >
                  <X aria-hidden />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
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
                    const active = isNavItemActive(item, pathname);
                    return (
                      <DialogPrimitive.Close asChild key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                          )}
                        >
                          <Icon aria-hidden className="size-4 shrink-0" />
                          <span className="truncate">{t(item.labelKey)}</span>
                        </Link>
                      </DialogPrimitive.Close>
                    );
                  })}
                </Fragment>
              ))}
            </nav>
            {showPersonChip ? (
              <div className="border-t p-2">
                <DialogPrimitive.Close asChild>
                  <Link
                    href="/whoami"
                    className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors"
                  >
                    <CircleUser aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">
                      {personName ?? t("whoami")}
                    </span>
                  </Link>
                </DialogPrimitive.Close>
              </div>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <Link href="/" aria-label={t("logoAria")} className="flex items-center">
        <LogoMark heightClass="h-7" />
      </Link>
      {/* Right side spacer matches the hamburger size so the logo sits centred-ish. */}
      <div className="size-8" aria-hidden />
    </header>
  );
}
