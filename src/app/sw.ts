/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

/**
 * Service worker entry. @serwist/next compiles this at build into
 * public/sw.js with the precache manifest stitched in.
 *
 * Cache strategy:
 *  - App shell (HTML, CSS, JS, fonts, logo, icons): precached at install
 *    via Serwist's generated manifest (handled by the `injectionPoint`
 *    in next.config.ts → @serwist/next plugin).
 *  - Read pages (RSC payloads + images): stale-while-revalidate via
 *    `defaultCache`, so a previously-visited bike still loads when the
 *    wifi drops, then refreshes in the background.
 *  - Writes (server actions, POST /api/*): bypassed entirely. If you're
 *    offline, writes fail loudly — the alternative (queue + replay) is
 *    too risky for v1.
 */
declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: (import("serwist").PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // navigationPreload was true; iOS Safari 16+ has a partial implementation
  // that races the document fetch with the preload, throwing the native
  // "This page couldn't load" error on first scan. Reload works because by
  // then the SW is fully active and warm. The preload saves a few hundred
  // ms on Chrome desktop and is broken on the device we care about, so
  // turn it off.
  navigationPreload: false,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
