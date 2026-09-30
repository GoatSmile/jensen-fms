import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The names a transcription engine should expect in this workshop's audio:
 * customers (their display names), colleagues, and bike families and models.
 * Munr measured a names list as the single largest accuracy win — four
 * engines misspelt one customer's name until it was on the list, then the
 * first one got it exactly (munr DECISIONS 2026-09-09). Sent to engines that
 * accept one (ElevenLabs `keyterms`); the vendor caps it at 1,000 terms of
 * ≤ 50 characters, so the most-used first: people, then customers, then bikes.
 */
const MAX_TERMS = 1000;

export async function loadTranscriptionKeyterms(supabase: SupabaseClient): Promise<string[]> {
  const [people, orgs, families, templates] = await Promise.all([
    supabase.from("people").select("full_name").eq("is_active", true).eq("is_system", false),
    supabase
      .from("organizations")
      .select("legal_name, display_name_da, display_name_en")
      .is("deleted_at", null)
      .eq("is_active", true)
      .limit(2000),
    supabase.from("bike_families").select("name").eq("is_active", true),
    supabase.from("bike_templates").select("name_en, name_da").eq("is_current", true),
  ]);
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    // Strip the TEST marker — "TEST Finn" is spoken "Finn".
    const t = (raw ?? "").replace(/^TEST\s+/, "").trim();
    const key = t.toLowerCase();
    if (!t || t.length > 50 || t.split(/\s+/).length > 5 || seen.has(key)) return;
    seen.add(key);
    terms.push(t);
  };
  for (const p of people.data ?? []) add(p.full_name);
  for (const o of orgs.data ?? []) add(o.display_name_da ?? o.display_name_en ?? o.legal_name);
  for (const f of families.data ?? []) add(f.name);
  for (const t of templates.data ?? []) {
    add(t.name_en);
    add(t.name_da);
  }
  return terms.slice(0, MAX_TERMS);
}
