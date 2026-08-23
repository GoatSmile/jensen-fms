/**
 * Person-picker queries (people & roles P3). One rule everywhere: a person
 * is pickable iff active AND today falls inside their engagement window
 * (the locked temp policy — people outside it just drop out of pickers,
 * nothing else). Both ends are optional and both are checked: a future
 * engaged_from hides a hire who hasn't started, exactly as a past
 * engaged_until hides one who has left.
 */
import { isCapability } from "@/lib/people/capabilities";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PickablePerson = { id: string; full_name: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The one engagement-window test — keep every picker reading this. */
function isEngaged(
  p: { engaged_from: string | null; engaged_until: string | null },
  today: string,
): boolean {
  return (
    (!p.engaged_from || p.engaged_from <= today) &&
    (!p.engaged_until || p.engaged_until >= today)
  );
}

/** All pickable people, for assignee pickers. */
export async function loadActivePeople(
  supabase: Supabase,
): Promise<PickablePerson[]> {
  const { data } = await supabase
    .from("people")
    .select("id, full_name, engaged_from, engaged_until")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  const today = todayISO();
  return (data ?? [])
    .filter((p) => isEngaged(p, today))
    .map((p) => ({ id: p.id, full_name: p.full_name }));
}

/**
 * The login screen's name list. Stricter than pickable: a name is only
 * offered if choosing it can actually get you in — engaged today, active,
 * password set, and holding at least one role (a role-less person would
 * log in with zero capabilities and get bounced off every route). The
 * shared Admin account is not here; it is its own entry, authenticated by
 * SITE_PASSWORD.
 */
export async function loadLoginPeople(
  supabase: Supabase,
): Promise<PickablePerson[]> {
  const { data } = await supabase
    .from("people")
    .select(
      "id, full_name, engaged_from, engaged_until, person_roles!inner(role_id)",
    )
    .eq("is_active", true)
    .eq("is_system", false)
    .not("password_hash", "is", null)
    .order("full_name", { ascending: true });
  const today = todayISO();
  return (data ?? [])
    .filter((p) => isEngaged(p, today))
    .map((p) => ({ id: p.id, full_name: p.full_name }));
}

/**
 * The one shared account (migration 80). Every login lands on a person, so
 * the shared password gets a name too — work done on it reads as "Admin"
 * rather than as nobody.
 */
export async function loadAdminPerson(
  supabase: Supabase,
): Promise<PickablePerson | null> {
  const { data } = await supabase
    .from("people")
    .select("id, full_name")
    .eq("is_system", true)
    .maybeSingle();
  return data ? { id: data.id, full_name: data.full_name } : null;
}

export type PersonAccess = {
  /** Primary role key — the person's lowest-sort_order active role. */
  role: string;
  /** That role's home_path. */
  home: string;
  /** UNION of every active role the person holds (they wear several hats). */
  caps: string[];
};

/**
 * What this person's roles open, resolved once at login and frozen into the
 * cookie. Null when they hold no active role — such a person can't be logged
 * in (they would have no capabilities and get bounced off every route), which
 * is why loadLoginPeople requires a role too.
 */
export async function loadPersonAccess(
  supabase: Supabase,
  personId: string,
): Promise<PersonAccess | null> {
  const { data } = await supabase
    .from("person_roles")
    .select("role:roles(id, key, home_path, sort_order, is_active)")
    .eq("person_id", personId);
  const roles = (data ?? [])
    .map((r) => r.role)
    .filter((r): r is NonNullable<typeof r> => r !== null && r.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (roles.length === 0) return null;

  const { data: capRows } = await supabase
    .from("role_capabilities")
    .select("capability")
    .in(
      "role_id",
      roles.map((r) => r.id),
    );
  const caps = Array.from(
    new Set((capRows ?? []).map((c) => c.capability).filter(isCapability)),
  );

  const primary = roles[0];
  return {
    role: primary.key,
    home: primary.home_path?.startsWith("/") ? primary.home_path : "/",
    caps,
  };
}
