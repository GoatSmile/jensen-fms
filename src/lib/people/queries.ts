/**
 * Person-picker queries (people & roles P3). One rule everywhere: a person
 * is pickable iff active AND not past their engaged_until date (the locked
 * temp policy — past-dated people just drop out of pickers, nothing else).
 */
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PickablePerson = { id: string; full_name: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** All pickable people, for assignee pickers. */
export async function loadActivePeople(
  supabase: Supabase,
): Promise<PickablePerson[]> {
  const { data } = await supabase
    .from("people")
    .select("id, full_name, engaged_until")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  const today = todayISO();
  return (data ?? [])
    .filter((p) => !p.engaged_until || p.engaged_until >= today)
    .map((p) => ({ id: p.id, full_name: p.full_name }));
}

/** Pickable people holding a role — the tap-your-name list. */
export async function loadPeopleForRole(
  supabase: Supabase,
  roleKey: string,
): Promise<PickablePerson[]> {
  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("key", roleKey)
    .maybeSingle();
  if (!role) return [];

  const { data } = await supabase
    .from("person_roles")
    .select("person:people(id, full_name, engaged_until, is_active)")
    .eq("role_id", role.id);
  const today = todayISO();
  return (data ?? [])
    .map((r) => r.person)
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter(
      (p) => p.is_active && (!p.engaged_until || p.engaged_until >= today),
    )
    .map((p) => ({ id: p.id, full_name: p.full_name }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "da"));
}
