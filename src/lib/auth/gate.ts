/**
 * The auth gate's shared bits (owner: "a login box on top of Vercel SSO").
 *
 * This is a UI gate, NOT a data security boundary: RLS is permissive and the
 * Supabase publishable key ships to the browser, so the real perimeter is
 * still Vercel SSO. The gate is opt-in — with no `SITE_PASSWORD` env var set,
 * middleware locks nothing (so any environment without the var behaves as
 * before).
 *
 * There is ONE token shape in the cookie: the signed person session
 * (session.ts). The old shared-password digest token was removed with
 * migration 80 — the shared password still works, but it now logs you in as
 * the `Admin` person and gets a signed session like every other login, so
 * every request can name who is making it.
 */
export const AUTH_COOKIE = "fms_auth";

/**
 * Sanitise a post-login redirect target: only internal absolute paths are
 * allowed (never protocol-relative `//host` or external URLs), so the `?next=`
 * param can't be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
