"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

/**
 * The shared `Section` card with a fold-away body. The whole header is the
 * toggle; the open/closed choice persists in localStorage under
 * `storageKey`, so the section reopens the way the user last left it
 * (per browser — the right scope while auth is deferred).
 *
 * SSR renders `defaultOpen`; the stored preference is applied in an effect
 * after mount (reading localStorage during render would mismatch
 * hydration). The one-frame flip is invisible in practice.
 */
export function CollapsibleSection({
  title,
  description,
  storageKey,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  /** localStorage key, e.g. "collapse:parts-details". */
  storageKey: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "1") setOpen(true);
    else if (stored === "0") setOpen(false);
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // Storage full/blocked — the toggle still works for this page view.
      }
      return next;
    });
  }

  return (
    <section className="rounded-md border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`hover:bg-muted/40 flex w-full items-center gap-2 px-4 py-3 text-left transition-colors ${
          open ? "border-b" : ""
        }`}
      >
        <ChevronRight
          className={`text-muted-foreground size-4 shrink-0 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          {description ? (
            <span className="text-muted-foreground text-xs">
              {description}
            </span>
          ) : null}
        </span>
      </button>
      {open ? <div className="p-4">{children}</div> : null}
    </section>
  );
}
