import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The inventory location to consume from / receive into when no explicit pick
 * is made. Prefers `app_settings.primary_location_id` (set at /admin/settings),
 * falling back to the first active location by code if it's unset or has since
 * been archived. Shared by the build and work-order consumption paths so they
 * agree on one default — and so the receive/adjust forms target the same one
 * while location info is hidden.
 */
export async function resolveDefaultLocationId(
  supabase: SupabaseServerClient,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: settings } = await supabase
    .from("app_settings")
    .select("primary_location_id")
    .eq("id", 1)
    .maybeSingle();

  const primaryId = settings?.primary_location_id ?? null;
  if (primaryId) {
    const { data: primary } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("id", primaryId)
      .eq("is_active", true)
      .maybeSingle();
    if (primary) return { ok: true, id: primary.id };
  }

  const { data: location, error: locErr } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (locErr || !location) {
    return {
      ok: false,
      error: `No active inventory location to consume from: ${
        locErr?.message ?? "none configured"
      }`,
    };
  }
  return { ok: true, id: location.id };
}
