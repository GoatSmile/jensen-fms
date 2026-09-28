import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type RecognitionSuggestion = {
  /** The fleet_number identifier type id — what the code is saved as. */
  typeId: string;
  /** Prefix + department code, e.g. "BKTM". */
  stem: string;
  /** The next free code under that stem, e.g. "BKTM07". */
  suggestion: string;
  /** The highest codes already used under the stem, newest last. */
  recent: string[];
};

/**
 * The recognition code a newly built bike should get (Dennis, 15 Sep
 * 02:25–02:32): the customer's prefix (`organizations.recognition_prefix`),
 * then the department's code (`organization_units.code`, when it has one),
 * then the next running number, two digits — continuing that customer's
 * sequence, so BKTM06 is followed by BKTM07. Null when the customer has no
 * prefix: bikes without a service agreement get no code, and the prefix is
 * what says a customer uses them.
 *
 * Only a SUGGESTION. The build screen asks, and the builder may decline.
 */
export async function suggestRecognitionCode(
  supabase: Supabase,
  owner: { organizationId: string | null; unitId: string | null },
): Promise<RecognitionSuggestion | null> {
  if (!owner.organizationId) return null;
  const [orgRes, unitRes, typeRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("recognition_prefix")
      .eq("id", owner.organizationId)
      .maybeSingle(),
    owner.unitId
      ? supabase
          .from("organization_units")
          .select("code")
          .eq("id", owner.unitId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("bike_identifier_types")
      .select("id")
      .eq("slug", "fleet_number")
      .maybeSingle(),
  ]);
  const prefix = orgRes.data?.recognition_prefix?.trim().toUpperCase();
  if (!prefix || !typeRes.data) return null;
  const unitCode = (unitRes.data?.code ?? "")
    .toUpperCase()
    .replace(/[^A-ZÆØÅ]/g, "");
  const stem = `${prefix}${unitCode}`;

  const { data: used } = await fetchAllRows((from, to) =>
    supabase
      .from("bike_identifiers")
      .select("id, identifier_value")
      .eq("identifier_type_id", typeRes.data!.id)
      .ilike("identifier_value", `${stem}%`)
      .order("id")
      .range(from, to),
  );
  const tail = new RegExp(`^${stem}(\\d+)$`, "i");
  const numbers = used
    .map((r) => r.identifier_value.toUpperCase().match(tail)?.[1])
    .filter((n): n is string => n != null)
    .map(Number)
    .sort((a, b) => a - b);
  const next = (numbers.at(-1) ?? 0) + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    typeId: typeRes.data.id,
    stem,
    suggestion: `${stem}${pad(next)}`,
    recent: numbers.slice(-3).map((n) => `${stem}${pad(n)}`),
  };
}
