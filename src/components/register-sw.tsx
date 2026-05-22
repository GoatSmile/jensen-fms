"use client";

import { useEffect } from "react";

/**
 * Tiny client-side registrar for the Serwist-built service worker. The
 * @serwist/next plugin compiles src/app/sw.ts into public/sw.js at build
 * time but doesn't auto-register it — that's intentional so each app
 * controls when (and whether) the SW takes over.
 *
 * We register it on mount in production only. In dev the plugin disables
 * the SW build entirely (see next.config.ts) and the file doesn't exist,
 * so the navigator.serviceWorker.register call is a no-op in dev anyway
 * because it would 404 — we gate on NODE_ENV to avoid the noise.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Skip registration on the public customer sticker landing. Customers
    // arriving via QR see /b/<id> exactly once, don't benefit from an
    // offline shell, and were hitting the iOS Safari first-nav bug. If a
    // SW was registered on an earlier visit (e.g. they followed a staff
    // link first), unregister it here so it doesn't keep intercepting
    // their navigations.
    if (window.location.pathname.startsWith("/b/")) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {
          /* not fatal */
        });
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      // Surface registration failures in the console; don't throw —
      // the app still works without the SW, just no offline shell.
      // eslint-disable-next-line no-console
      console.warn("Service worker registration failed:", err);
    });
  }, []);
  return null;
}
