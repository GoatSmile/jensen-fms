import type { NextConfig } from "next";
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
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSerwist(nextConfig);
