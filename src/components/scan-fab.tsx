"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanLine } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Floating "Scan" button anchored bottom-right. Phone-only (md:hidden);
 * the desktop sidebar already has navigation. Hidden on /scan itself
 * and on the public bike pages (where users are already scanning or have
 * just landed from a scan).
 */
export function ScanFab() {
  const pathname = usePathname();
  const hide =
    pathname === "/scan" ||
    pathname.startsWith("/b/") ||
    pathname.startsWith("/report/");
  if (hide) return null;
  return (
    <Link
      href="/scan"
      aria-label="Scan a QR sticker"
      className={cn(
        "bg-primary text-primary-foreground fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 md:hidden",
      )}
    >
      <ScanLine className="size-5" aria-hidden />
    </Link>
  );
}
