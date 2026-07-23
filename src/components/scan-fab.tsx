"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ScanLine } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Floating "Scan" button anchored bottom-right. Phone-only (md:hidden);
 * the desktop sidebar already has navigation. Hidden on /scan itself
 * and on the public bike pages (where users are already scanning or have
 * just landed from a scan).
 */
export function ScanFab({
  allowedCaps,
}: {
  /** Role capability scope; null = show everything (gate off / legacy). */
  allowedCaps: string[] | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("scan");
  const hide =
    (allowedCaps !== null && !allowedCaps.includes("scan")) ||
    pathname === "/scan" ||
    pathname === "/login" ||
    pathname.startsWith("/b/") ||
    pathname.startsWith("/report/") ||
    // /work has its own Scan button in the queue header; the workspace
    // (/work/<woId>) reserves the bottom edge for the Start/Mark-done
    // action bar — the FAB would sit on top of it.
    pathname.startsWith("/work") ||
    // The customer map is full-bleed Leaflet; the FAB would float
    // on top of the legend / zoom controls.
    pathname === "/organizations/map";
  if (hide) return null;
  return (
    <Link
      href="/scan"
      aria-label={t("fabLabel")}
      className={cn(
        "bg-primary text-primary-foreground fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 md:hidden",
      )}
    >
      <ScanLine className="size-5" aria-hidden />
    </Link>
  );
}
