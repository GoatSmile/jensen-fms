"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type IdentifierResult = { ok: true } | { ok: false; error: string; field?: string };

/**
 * Register a new identifier on a bike. The schema enforces global uniqueness
 * per identifier_type (UNIQUE on type + value), so a friendly error fires when
 * someone tries to reuse a frame number or lock number.
 *
 * `format_regex` on the identifier_type, when set, is checked client-side
 * AND server-side (regex re-eval here) so manipulated form posts can't
 * smuggle invalid values past UI validation.
 */
export async function createBikeIdentifier(
  bikeId: string,
  formData: FormData,
  extraRevalidatePaths?: string[],
): Promise<IdentifierResult> {
  if (!bikeId) return { ok: false, error: "Missing bike id." };
  const identifier_type_id = nullable(formData.get("identifier_type_id"));
  const identifier_value = nullable(formData.get("identifier_value"));
  const notes = nullable(formData.get("notes"));

  if (!identifier_type_id) {
    return { ok: false, error: "Pick an identifier type.", field: "identifier_type_id" };
  }
  if (!identifier_value) {
    return { ok: false, error: "Identifier value is required.", field: "identifier_value" };
  }

  const supabase = await createClient();

  // Server-side regex validation so the action stands on its own without UI cooperation.
  const { data: typeRow } = await supabase
    .from("bike_identifier_types")
    .select("name_en, format_regex")
    .eq("id", identifier_type_id)
    .maybeSingle();
  if (typeRow?.format_regex) {
    try {
      const re = new RegExp(typeRow.format_regex);
      if (!re.test(identifier_value)) {
        return {
          ok: false,
          error: `${typeRow.name_en} doesn't match the expected format (${typeRow.format_regex}).`,
          field: "identifier_value",
        };
      }
    } catch {
      // Stored regex is invalid — fall through. Surfacing this as a soft warning
      // is better than blocking on a config-level bug.
    }
  }

  const { error } = await supabase.from("bike_identifiers").insert({
    bike_id: bikeId,
    identifier_type_id,
    identifier_value,
    notes,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That value is already registered as the same kind of identifier on another bike.",
        field: "identifier_value",
      };
    }
    return { ok: false, error: `Could not register: ${error.message}` };
  }

  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath("/bikes");
  // Callers that render this bike's identifiers on another route (e.g. the
  // build workbench) pass their own path so it refreshes too.
  for (const p of extraRevalidatePaths ?? []) revalidatePath(p);
  return { ok: true };
}

/**
 * Mark an identifier as inactive (e.g., the original was damaged and replaced).
 * The row stays in the database for history; a fresh identifier of the same
 * type is registered separately.
 */
export async function deactivateBikeIdentifier(
  bikeId: string,
  identifierId: string,
): Promise<IdentifierResult> {
  if (!bikeId || !identifierId) {
    return { ok: false, error: "Missing bike id or identifier id." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_identifiers")
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
    })
    .eq("id", identifierId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}
