import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/auth/gate";
import { verifySessionToken } from "@/lib/auth/session";
import { routeCapability } from "@/lib/people/routes";

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

/**
 * Auth gate + capability routing.
 *
 * One token shape in the fms_auth cookie: the signed person session
 * (`v2.…`), gating routes by the caps frozen at login. Anything else or
 * missing → redirect to /login. (The legacy shared-password digest token
 * went with migration 80; the shared password now signs an Admin session.)
 *
 * No DB access here (Edge): the session is self-contained by design —
 * capability edits apply at next login.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return nextWithPathname(req);

  // Opt-in: with no SITE_PASSWORD configured, the gate locks nothing.
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return nextWithPathname(req);

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token) {
    const session = await verifySessionToken(token, expected);
    if (session) {
      const needed = routeCapability(pathname);
      if (!needed || session.caps.includes(needed)) {
        return nextWithPathname(req);
      }
      // Uncapable route → bounce to their home. If home itself is the
      // blocked path (misconfigured role), pass through rather than loop.
      if (pathname === session.home) return nextWithPathname(req);
      const url = req.nextUrl.clone();
      url.pathname = session.home;
      url.search = "";
      return NextResponse.redirect(url);
    }
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
