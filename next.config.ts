import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

/**
 * Service worker setup. Disabled in dev so HMR doesn't fight the cache
 * (also keeps the iteration loop fast). In production builds, Serwist
 * compiles src/app/sw.ts into public/sw.js with the precache manifest
 * stitched in.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // cacheOnNavigation was true; combined with iOS Safari's flaky
  // navigation-preload handling, it intercepted the very first /b/<id>
  // document load before the SW was warm and returned an error response.
  // Leaving HTML navigations to the network (and only caching JS/CSS/font
  // shell + RSC payloads via defaultCache) trades a little offline
  // resilience for first-scan reliability.
  cacheOnNavigation: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Empty turbopack config silences Next.js 16's "you have a webpack
  // config but no turbopack config" warning — Serwist injects a webpack
  // config that we only need for production builds; dev runs Turbopack.
  turbopack: {},
};

// Locale comes from app_settings (no URL routing) — see src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withSerwist(withNextIntl(nextConfig));
