"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE } from "@/lib/auth/gate";

/**
 * Sign out. A POST server action, NOT the `/logout` GET route, because the
 * chrome links to it from every page: Next PREFETCHES a `<Link>` in the
 * viewport, so a GET that deletes the session cookie fires without anyone
 * clicking it — which logged the user out roughly once per navigation
 * (found in prod 2026-08-23, minutes after shipping the sign-out row).
 *
 * General rule this is an instance of: a control that changes state is never
 * a prefetchable link.
 */
export async function logout(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}
