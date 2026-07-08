"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type FoldSectionProps = {
  /** localStorage key suffix — stable per section, not per render. */
  storageId: string;
  title: string;
  /** One-line signal shown in the header while collapsed, so folding hides detail, not information. */
  summary?: string | null;
  /**
   * Server-computed, data-aware default (e.g. collapsed while a chart has
   * almost no history). A choice the user has made on this device wins.
   */
  defaultOpen: boolean;
  children: React.ReactNode;
};

const STORAGE_PREFIX = "dashboard.fold.";

/**
 * Collapsible dashboard section. Content is only mounted while open —
 * charts (Recharts ResponsiveContainer) can't measure themselves inside
 * a hidden container, and a folded section shouldn't cost render work.
 */
export function FoldSection({
  storageId,
  title,
  summary,
  defaultOpen,
  children,
}: FoldSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_PREFIX + storageId);
      if (stored === "1") setOpen(true);
      else if (stored === "0") setOpen(false);
    } catch {
      // Private mode etc. — fall back to the data-aware default.
    }
  }, [storageId]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          STORAGE_PREFIX + storageId,
          next ? "1" : "0",
        );
      } catch {
        // Ignore — the toggle still works for this visit.
      }
      return next;
    });
  };

  return (
    <section className="rounded-lg border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          {!open && summary ? (
            <span className="text-muted-foreground truncate text-xs">
              {summary}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}
