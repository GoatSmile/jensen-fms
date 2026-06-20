"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
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
  Menu,
  Paintbrush,
  Receipt,
  Settings,
  ShieldCheck,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match this route exactly (no prefix matching) — used for the root link. */
  exact?: boolean;
};

// Grouped to match the desktop sidebar (separators between groups). The
// customer Map now lives under Admin, so it's not here.
const NAV_GROUPS: NavItem[][] = [
  [
    { href: "/", label: "Dashboard", icon: Home, exact: true },
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

/**
 * Mobile top bar with a hamburger drawer — shown only below md. Desktop uses
 * the persistent sidebar. No shadcn Sheet primitive is installed, so this is
 * a radix Dialog rendered as a full-height left drawer (we use the radix
 * primitives directly so we can ditch the centred-modal styles that
 * shadcn's DialogContent applies).
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer when the route changes — clicking a nav link navigates,
  // and the dialog state needs to follow.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing drawer state to navigation (close on route change)
    setOpen(false);
  }, [pathname]);

  // Hide on public-scan routes — those pages are customer-facing and
  // shouldn't expose the workshop nav.
  if (pathname.startsWith("/b/") || pathname.startsWith("/report/")) {
    return null;
  }

  return (
    <header className="bg-background sticky top-0 z-30 flex h-12 items-center justify-between border-b px-3 md:hidden print:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
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
              Navigation
            </DialogPrimitive.Title>
            <div className="flex h-20 items-center justify-between border-b px-4">
              <Link
                href="/"
                aria-label="Jensen FMS — Dashboard"
                className="flex items-center"
              >
                <Logo heightClass="h-12" />
              </Link>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close navigation"
                >
                  <X aria-hidden />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
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
                    // orders. Highlight it for both sub-routes.
                    const isMaintenanceItem =
                      item.href === "/maintenance/tickets";
                    // Customers shouldn't claim the customer map (now under Admin).
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
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </DialogPrimitive.Close>
                    );
                  })}
                </Fragment>
              ))}
            </nav>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <Link
        href="/"
        aria-label="Jensen FMS — Dashboard"
        className="flex items-center"
      >
        <Logo heightClass="h-7" />
      </Link>
      {/* Right side spacer matches the hamburger size so the logo sits centred-ish. */}
      <div className="size-8" aria-hidden />
    </header>
  );
}
