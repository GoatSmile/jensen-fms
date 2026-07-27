"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Scrolls to `location.hash` after a client-side navigation.
 *
 * Next's App Router only honours a hash when the target already exists at the
 * moment the navigation commits. Arriving from another route — e.g. the
 * family chip on a template detail page linking to
 * `/bike-templates#family-<id>` — the group renders a tick later, so the
 * browser had nothing to scroll to
 * and the page sat at the top with the hash set. A full page load is fine
 * (the document is parsed before the scroll), so this only covers the
 * client-side case.
 */
export function HashScroll() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const { hash } = window.location;
    if (!hash || hash.length < 2) return;
    // Wait one paint so a target rendered with this navigation exists.
    const id = requestAnimationFrame(() => {
      document
        .getElementById(decodeURIComponent(hash.slice(1)))
        ?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(id);
    // Re-run when the route changes: the same list page can be re-entered
    // with a different family hash.
  }, [pathname, searchParams]);

  return null;
}
