"use client";

import { useEffect } from "react";

const DEFAULT_MESSAGE =
  "You have unsaved changes. Leave this page and discard them?";

/**
 * Warn before leaving the page while there are unsaved changes.
 *
 * Two escape routes are covered:
 *   - `beforeunload` — tab close, reload, and navigation away from the app
 *     (the browser shows its own generic prompt).
 *   - A capture-phase click interceptor for in-app `<Link>` / `<a>` navigation,
 *     which the App Router otherwise performs with no confirmation hook. The
 *     App Router has no public route-change-blocker API, so intercepting the
 *     click is the pragmatic stand-in.
 *
 * Pass `when = true` while there are unsaved edits.
 */
export function useUnsavedChangesGuard(
  when: boolean,
  message: string = DEFAULT_MESSAGE,
) {
  useEffect(() => {
    if (!when) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy requirement for the native prompt to appear in some browsers.
      e.returnValue = "";
    };

    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      // Let modified clicks (new tab / window, etc.) and non-primary buttons
      // through untouched.
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      // Links that open elsewhere are left to the beforeunload guard.
      if (anchor.target && anchor.target !== "_self") return;
      // Only guard same-origin (internal) navigation here.
      if (/^https?:\/\//i.test(href)) {
        try {
          if (new URL(href).origin !== window.location.origin) return;
        } catch {
          return;
        }
      }

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase so we run before Next's Link click handler navigates.
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [when, message]);
}
