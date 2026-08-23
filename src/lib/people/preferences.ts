/**
 * Per-person UI preferences (migration 81).
 *
 * WHY NOT A COOKIE / localStorage, which is what these were: both are per
 * BROWSER. On a shared shop tablet that means one person's arrangement greets
 * the next one, and the same person gets a different app on their phone. Since
 * login now carries a person (migration 80), the preferences live on the
 * person and travel with the login.
 *
 * Read whole, by id, once per render (the app layout already loads the person
 * for the nav chip — this rides along in that same query). Never queried
 * across people, which is why one JSONB column beats a table.
 *
 * Unknown keys are ignored rather than rejected: an older client writing an
 * older shape must not break the render, and a preference removed from the app
 * should stop mattering without a migration.
 */

export type UiPreferences = {
  /** Sidebar group id → expanded. Absent id = that group's code default. */
  navOpen: Record<string, boolean>;
  /** Desktop rail collapsed to icons. */
  navCollapsed: boolean;
};

export const EMPTY_PREFERENCES: UiPreferences = {
  navOpen: {},
  navCollapsed: false,
};

export function parsePreferences(raw: unknown): UiPreferences {
  if (typeof raw !== "object" || raw === null) return EMPTY_PREFERENCES;
  const r = raw as Record<string, unknown>;

  const navOpen: Record<string, boolean> = {};
  if (typeof r.navOpen === "object" && r.navOpen !== null) {
    for (const [id, open] of Object.entries(r.navOpen)) {
      if (typeof open === "boolean") navOpen[id] = open;
    }
  }

  return {
    navOpen,
    navCollapsed: r.navCollapsed === true,
  };
}

/**
 * Resolve the nav state actually used for a render.
 *
 * - Nothing stored for a group → its code default. That is what keeps a group
 *   ADDED LATER from arriving silently closed.
 * - Stored → the stored value wins, including for the group containing the
 *   current page: once someone has closed a group, navigating into it must not
 *   re-open it or following a dashboard link would undo their setting.
 */
export function resolveOpenGroups(
  stored: Record<string, boolean>,
  groupIds: readonly string[],
  defaultOpen: (id: string) => boolean,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of groupIds) {
    out[id] = id in stored ? stored[id] : defaultOpen(id);
  }
  return out;
}
