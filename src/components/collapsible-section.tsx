"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Panel } from "@/components/ui/panel";

/**
 * A `Panel` with a fold-away body whose open/closed choice persists in
 * localStorage under `storageKey`, so the section reopens the way the user
 * last left it (per browser — the right scope while auth is deferred).
 *
 * SSR renders `defaultOpen`; the stored preference is applied in an effect
 * after mount (reading localStorage during render would mismatch
 * hydration). The one-frame flip is invisible in practice.
 *
 * For a section of a FORM, use `FormSection` instead — same fold, no
 * persistence, because the right default there depends on the record being
 * edited rather than on what the user chose last time.
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
    <Panel
      title={
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="hover:text-ink -m-1 flex items-center gap-1.5 rounded p-1 text-left transition-colors"
        >
          <ChevronRight
            className={`size-3.5 shrink-0 transition-transform ${
              open ? "rotate-90" : ""
            }`}
            aria-hidden
          />
          {title}
        </button>
      }
      description={description}
      className={open ? undefined : "pb-2"}
    >
      {open ? children : null}
    </Panel>
  );
}
