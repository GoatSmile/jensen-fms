"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { AssistantPanel } from "./assistant-panel";

/**
 * The ONE floating button (owner, 2026-10-01: "all one button, and if
 * somebody wants to use the camera, they can do it") — bottom right on every
 * screen, phone and desktop alike, opening the assistant's panel, which also
 * holds Scan. ⌘K / Ctrl+K opens and closes it from the keyboard. It replaced
 * the Scan button, the sidebar's *Dictate a command* and the phone header's
 * sparkle, so there is one way in.
 *
 * Its icon is a sparkle, not a microphone: the panel has its own Dictate
 * microphone, and two mic icons on one screen read as two different things
 * (Munr's lesson).
 */
export function AssistantButton({
  allowedCaps,
}: {
  /** Role capability scope; null = everything (gate off). */
  allowedCaps: string[] | null;
}) {
  const t = useTranslations("assistant");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [shortcut, setShortcut] = useState("Ctrl K");

  const hidden =
    pathname === "/login" ||
    pathname === "/scan" ||
    pathname.startsWith("/b/") ||
    pathname.startsWith("/report") ||
    // The work-order workspace keeps the bottom edge for its action bar.
    /^\/work\/(?!paint-runs|deliveries)[^/]+/.test(pathname) ||
    // The customer map is full-bleed Leaflet; the button would sit on its controls.
    pathname === "/organizations/map";

  useEffect(() => {
    // After hydration only, so server and client render the same label first.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform read
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘K");
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A navigation (an Open, a choice) closes the panel.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the route
    setOpen(false);
  }, [pathname]);

  if (hidden) return null;
  const canScan = allowedCaps === null || allowedCaps.includes("scan");

  return (
    <>
      {open ? <AssistantPanel onClose={() => setOpen(false)} canScan={canScan} /> : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("buttonLabel")}
        className={cn(
          "bg-brand text-on-brand shadow-popover fixed right-4 bottom-4 z-40 flex items-center justify-center rounded-full transition-transform active:scale-95",
          // Phone: a round button where Scan used to sit. Desktop: a pill that says what it is.
          "size-14 md:h-11 md:w-auto md:gap-2 md:px-4",
          open && "max-md:hidden",
        )}
      >
        <Sparkles className="size-5 md:size-4" aria-hidden />
        <span className="hidden text-sm font-medium md:inline">{t("buttonLabel")}</span>
        <kbd className="text-on-brand hidden font-sans text-xs font-normal md:inline">{shortcut}</kbd>
      </button>
    </>
  );
}
