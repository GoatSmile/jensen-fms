import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANY } from "@/lib/invoicing/company";

/**
 * The names a transcription engine should expect in this workshop's audio:
 * the shop's own names, colleagues, customers (their display names and
 * recognition prefixes), bike families and models, and bikes' recognition codes.
 * Munr measured a names list as the single largest accuracy win — four
 * engines misspelt one customer's name until it was on the list, then the
 * first one got it exactly (munr DECISIONS 2026-09-09). Sent to engines that
 * accept one (ElevenLabs `keyterms`); the vendor caps it at 1,000 terms of
 * ≤ 50 characters, so the most-used first: our own names, people, customers,
 * bikes — and the recognition codes last, because they are many and a cut
 * there costs one bike, not a customer.
 */
const MAX_TERMS = 1000;

/**
 * What the shop calls itself on the phone. Without these, "Finn fra Jensen
 * Cykler" was heard as "Aho Cykler" (7 Oct). Not in the DB: there is one
 * company, and its legal name lives in `COMPANY` beside these spoken ones.
 */
const OWN_NAMES = [COMPANY.name, "Jensen Production", "Jensen Cykler", "Logocykler"];

/** Bike recognition codes (`fleet_number`, e.g. BKTM01). Fixed id, see match.ts. */
const FLEET_NUMBER_TYPE_ID = "f1ee7000-0000-4000-8000-000000000001";

export async function loadTranscriptionKeyterms(supabase: SupabaseClient): Promise<string[]> {
  const [people, orgs, families, templates, codes] = await Promise.all([
    supabase.from("people").select("full_name").eq("is_active", true).eq("is_system", false),
    supabase
      .from("organizations")
      .select("legal_name, display_name_da, display_name_en, recognition_prefix")
      .is("deleted_at", null)
      .eq("is_active", true)
      .limit(2000),
    supabase.from("bike_families").select("name").eq("is_active", true),
    supabase.from("bike_templates").select("name_en, name_da").eq("is_current", true),
    supabase
      .from("bike_identifiers")
      .select("identifier_value")
      .eq("identifier_type_id", FLEET_NUMBER_TYPE_ID)
      .eq("is_active", true)
      .limit(MAX_TERMS),
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
  for (const n of OWN_NAMES) add(n);
  for (const p of people.data ?? []) add(p.full_name);
  for (const o of orgs.data ?? []) add(o.display_name_da ?? o.display_name_en ?? o.legal_name);
  for (const o of orgs.data ?? []) add(o.recognition_prefix);
  for (const f of families.data ?? []) add(f.name);
  for (const t of templates.data ?? []) {
    add(t.name_en);
    add(t.name_da);
  }
  for (const c of codes.data ?? []) add(c.identifier_value);
  return terms.slice(0, MAX_TERMS);
}
