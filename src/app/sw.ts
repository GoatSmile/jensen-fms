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
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
