import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/auth/gate";

/**
 * Clear the gate cookie and bounce to the login screen. Reachable at /logout
 * (no button wired into the chrome yet — visit the URL to sign out).
 */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
