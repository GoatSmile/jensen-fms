"use server";

import { readPersonId } from "@/lib/auth/read-session";
import { parsePreferences, type UiPreferences } from "@/lib/people/preferences";
import { createClient } from "@/lib/supabase/server";

/**
 * Persist one slice of the logged-in person's UI preferences (migration 81).
 *
 * Fire-and-forget from the nav: the client already moved, so a failed write
 * costs a lost preference, never a broken interaction — hence no return value
 * and no thrown error. Read-modify-write on one JSONB column, which is safe
 * here because the only writer is the person themselves, in one tab at a time.
 *
 * With the gate off (no SITE_PASSWORD) there is no person to attribute this
 * to, so it is a no-op and the nav simply renders its defaults.
 */
export async function savePreferences(
  patch: Partial<UiPreferences>,
): Promise<void> {
  const personId = await readPersonId();
  if (!personId) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("ui_preferences")
    .eq("id", personId)
    .maybeSingle();

  const current = parsePreferences(data?.ui_preferences);
  const next: UiPreferences = {
    ...current,
    ...patch,
    navOpen: { ...current.navOpen, ...(patch.navOpen ?? {}) },
  };

  await supabase
    .from("people")
    .update({ ui_preferences: next })
    .eq("id", personId);
}
