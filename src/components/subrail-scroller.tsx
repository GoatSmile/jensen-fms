"use client";

import { useEffect, useRef } from "react";

/**
 * Horizontal scroll container for an admin sub-rail on narrow screens. Shared by
 * `/admin/settings` (five sections) and `/admin/lists` (seven vocabularies).
 *
 * Exists for one reason: below `md` the rail scrolls sideways, and the active
 * item can sit off-screen. Landing on `?section=phone` showed a rail reading
 * "General · Communication · Accounting" with the current section out of view —
 * you could not see where you were, which is the one job a rail has. The same
 * applies harder to seven vocabularies than it did to five sections.
 *
 * The active item is still marked SERVER-side (`aria-current`); this only nudges
 * `scrollLeft` after mount, so there is no flash of wrong state and nothing to
 * hydrate but the scroll offset. `block: "nearest"` keeps it from scrolling the
 * whole page vertically as a side effect.
 */
export function SubRailScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = ref.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);
  return (
    <div
      ref={ref}
      // Scrollbar hidden: the rail is a handful of short pills, so a visible bar
      // reads as chrome rather than as an affordance.
      className="overflow-x-auto [scrollbar-width:none] md:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
