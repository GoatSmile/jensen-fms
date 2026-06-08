import type { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Org + unit options for the agreement form's customer/unit pickers. */
export async function loadPickers(supabase: DB) {
  const [orgsRes, unitsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, legal_name, display_name_en, display_name_da")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("legal_name", { ascending: true }),
    supabase
      .from("organization_units")
      .select("id, name, organization_id")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const organizations = (orgsRes.data ?? []).map((o) => ({
    id: o.id,
    name: o.display_name_da ?? o.display_name_en ?? o.legal_name,
  }));
  const units = (unitsRes.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    organization_id: u.organization_id,
  }));
  return { organizations, units };
}
