import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/auth/gate";

/**
 * Clear the gate cookie and bounce to the login screen. This is the TYPED-URL
 * escape hatch; the chrome's sign-out control is a POST server action
 * (`src/app/_actions/logout.ts`), because a `<Link>` to this route gets
 * PREFETCHED and signs the user out with no click at all.
 *
 * Belt and braces for the same reason: a prefetch (or any other speculative
 * fetch) redirects without touching the cookie. A GET that mutates is wrong on
 * its own terms — link previews, scanners and chat unfurls all fire it.
 */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  const speculative =
    req.headers.get("next-router-prefetch") !== null ||
    req.headers.get("purpose") === "prefetch" ||
    req.headers.get("sec-purpose")?.includes("prefetch") === true;
  if (!speculative) res.cookies.delete(AUTH_COOKIE);
  return res;
}
