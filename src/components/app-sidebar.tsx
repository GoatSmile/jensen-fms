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
  Home,
  Paintbrush,
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
  { href: "/organizations", label: "Customers", icon: Building2 },
  { href: "/manufacturing-orders", label: "Manufacturing orders", icon: Hammer },
  { href: "/paint-orders", label: "Paint orders", icon: Paintbrush },
];

export function AppSidebar() {
  const pathname = usePathname();
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
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
