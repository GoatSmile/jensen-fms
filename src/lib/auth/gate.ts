/**
 * Simple shared-password gate (owner: "a login box on top of Vercel SSO").
 *
 * This is a UI gate, NOT a data security boundary: RLS is off and the Supabase
 * publishable key ships to the browser, so the real perimeter is still Vercel
 * SSO. The gate is opt-in — with no `SITE_PASSWORD` env var set, middleware locks
 * nothing (so any environment without the var behaves as before).
 *
 * The auth cookie stores a SHA-256 digest of the password (+ a fixed pepper),
 * not the password itself: it can't be reversed and can't be forged without
 * knowing the password. We use Web Crypto (`crypto.subtle`) so the exact same
 * helper runs in Edge middleware and in the Node server action.
 */
export const AUTH_COOKIE = "fms_auth";

const PEPPER = "jensen-fms:gate:v1";

/** Stable token for a password — stored in the cookie, recomputed to verify. */
export async function passwordToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${password}:${PEPPER}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sanitise a post-login redirect target: only internal absolute paths are
 * allowed (never protocol-relative `//host` or external URLs), so the `?next=`
 * param can't be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
