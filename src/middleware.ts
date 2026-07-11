import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE, passwordToken } from "@/lib/auth/gate";

// Stays reachable without the password: the login screen + logout, and the
// public customer-facing flows (QR sticker landing `/b/<id>` and the report
// form). Everything else is behind the gate when it's enabled.
const PUBLIC_PREFIXES = ["/login", "/logout", "/b", "/report"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Pass the request through with `x-pathname` stamped on it — the i18n
 * request config (src/i18n/request.ts) reads it to tell worker surfaces
 * (worker_language) apart from the rest of the app (app_language).
 */
function nextWithPathname(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return nextWithPathname(req);

  // Opt-in: with no SITE_PASSWORD configured, the gate locks nothing.
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return nextWithPathname(req);

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === (await passwordToken(expected))) {
    return nextWithPathname(req);
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on pages only — skip API routes (the cron route self-authenticates with
  // a Bearer token), Next internals, and any static asset (anything with a dot:
  // sw.js, manifest.webmanifest, icons, favicons, images).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
