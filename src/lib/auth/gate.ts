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
 * Who logged in on THIS browser last, so the login screen can preselect them.
 *
 * Deliberately a cookie and not a person preference (migration 81 moved those
 * onto the person): this is device state, and it has to be readable when there
 * is no session at all — that is the whole point of it. It carries a
 * `people.id`, which the login screen already lists by name, so it discloses
 * nothing the page doesn't. It SURVIVES sign-out; forgetting who you are is
 * not what signing out means.
 */
export const LAST_PERSON_COOKIE = "fms_last_person";

/**
 * Sanitise a post-login redirect target: only internal absolute paths are
 * allowed (never protocol-relative `//host` or external URLs), so the `?next=`
 * param can't be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
