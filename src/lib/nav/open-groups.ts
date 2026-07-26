/**
 * Which sidebar groups are expanded, persisted per browser.
 *
 * WHY A COOKIE AND NOT localStorage: the sidebar renders SERVER-SIDE in
 * `src/app/layout.tsx`. With localStorage the server has no idea what is open,
 * so every page load would render everything closed and then pop groups open
 * after hydration — a layout shift on every single navigation. A cookie is
 * readable in the server layout, same as the existing `fms_auth` and
 * role-session cookies.
 *
 * ENCODING: explicit `id:1|0` pairs, e.g. `nav_open=bikes:1,orders:0`.
 *
 * The design note proposed a comma-joined list of OPEN ids, but that can't
 * satisfy both of its own requirements at once. It needs:
 *   1. absent cookie  -> code defaults (never set)
 *   2. empty cookie   -> deliberately all closed
 *   3. a group added later -> its code default, not silently closed
 * With open-ids-only, a newly added group is simply missing from the string,
 * which is indistinguishable from "closed" — so (3) breaks. Recording each
 * group's state explicitly keeps "unmentioned" free to mean "new, use the
 * default", and the cookie is still tiny.
 */

export const NAV_OPEN_COOKIE = "nav_open";

/** Durable preference, not a session: "stays so until changed". */
export const NAV_OPEN_MAX_AGE = 60 * 60 * 24 * 365;

export type OpenGroups = Record<string, boolean>;

/**
 * Parse the cookie into explicit per-group state. Returns `null` for an ABSENT
 * cookie so callers can tell "never set" from "set to nothing" — collapsing
 * those two is the obvious bug here.
 */
export function parseOpenGroups(raw: string | undefined): OpenGroups | null {
  if (raw === undefined) return null;
  const state: OpenGroups = {};
  for (const part of raw.split(",")) {
    const [id, flag] = part.split(":");
    const key = id?.trim();
    if (!key) continue;
    state[key] = flag?.trim() === "1";
  }
  return state;
}

export function serializeOpenGroups(state: OpenGroups): string {
  return Object.entries(state)
    .map(([id, open]) => `${id}:${open ? 1 : 0}`)
    .join(",");
}

/**
 * Write the state to the cookie. Client-only.
 *
 * A function rather than an inline `document.cookie = ...` in each nav for two
 * reasons: the desktop rail and the mobile drawer were repeating the same
 * cookie string, and the React Compiler lint rule rejects assigning to a
 * property of a module-scope object inside a component ("This value cannot be
 * modified") — which is what an inline write is, even from an event handler.
 */
export function persistOpenGroups(state: OpenGroups): void {
  document.cookie = `${NAV_OPEN_COOKIE}=${serializeOpenGroups(state)}; path=/; max-age=${NAV_OPEN_MAX_AGE}; samesite=lax`;
}

/**
 * Resolve the state actually used for a render.
 *
 * - No cookie at all → every group takes its code default.
 * - Cookie present → a group it mentions uses the stored value; a group it
 *   does NOT mention is new since the cookie was written, so it takes its
 *   code default rather than arriving closed.
 *
 * `defaultOpen` is deliberately a per-group function so a caller can open the
 * group containing the current page. Note this only ever applies to groups the
 * person has never expressed an opinion about: once a group is in the cookie,
 * navigating into it must NOT force it open, or following a dashboard link
 * would silently undo their setting.
 */
export function resolveOpenGroups(
  raw: string | undefined,
  groupIds: readonly string[],
  defaultOpen: (id: string) => boolean,
): OpenGroups {
  const stored = parseOpenGroups(raw);
  const out: OpenGroups = {};
  for (const id of groupIds) {
    out[id] =
      stored && id in stored ? (stored[id] as boolean) : defaultOpen(id);
  }
  return out;
}
