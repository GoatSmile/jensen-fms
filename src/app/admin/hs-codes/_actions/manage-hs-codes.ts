"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type HsCodeResult = { ok: true } | { ok: false; error: string };

type ParsedHsCode = {
  code: string;
  description: string;
  tariff_pct: number;
  notes: string | null;
  is_active: boolean;
};

function parsePctInput(
  raw: string | null,
): { ok: true; value: number } | { ok: false; error: string } {
  if (!raw || raw.trim() === "") {
    return { ok: false, error: "Tariff % is required (decimal: 0.10 = 10 %)." };
  }
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Tariff % must be a number." };
  }
  if (n < 0 || n > 1) {
    return {
      ok: false,
      error: "Tariff % must be between 0 and 1 (decimal — 0.10 = 10 %).",
    };
  }
  return { ok: true, value: n };
}

function parseFormData(
  formData: FormData,
): { ok: true; values: ParsedHsCode } | { ok: false; error: string } {
  const code = nullable(formData.get("code"))?.trim();
  if (!code) return { ok: false, error: "Code is required." };

  const description = nullable(formData.get("description"))?.trim();
  if (!description) return { ok: false, error: "Description is required." };

  const tariff = parsePctInput(nullable(formData.get("tariff_pct")));
  if (!tariff.ok) return { ok: false, error: tariff.error };

  return {
    ok: true,
    values: {
      code,
      description,
      tariff_pct: tariff.value,
      notes: nullable(formData.get("notes")),
      is_active: formData.get("is_active") === "on",
    },
  };
}

export async function createHsCode(
  formData: FormData,
): Promise<HsCodeResult> {
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("hs_codes").insert(parsed.values);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `HS code "${parsed.values.code}" already exists.` };
    }
    return { ok: false, error: `Could not create: ${error.message}` };
  }
  revalidatePath("/admin/hs-codes");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateHsCode(
  id: string,
  formData: FormData,
): Promise<HsCodeResult> {
  if (!id) return { ok: false, error: "Missing id." };
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("hs_codes")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `HS code "${parsed.values.code}" already exists.` };
    }
    return { ok: false, error: `Could not update: ${error.message}` };
  }
  revalidatePath("/admin/hs-codes");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Soft-archive: HS codes referenced by parts can't be hard-deleted without
 * cascading the tariff snapshot loss. Flipping is_active off is a quick way
 * to hide the code from pickers without disrupting historical PO lines
 * (which carry their own snapshotted tariff_pct).
 */
export async function archiveHsCode(id: string): Promise<HsCodeResult> {
  if (!id) return { ok: false, error: "Missing id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("hs_codes")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: `Could not archive: ${error.message}` };
  }
  revalidatePath("/admin/hs-codes");
  revalidatePath("/admin");
  return { ok: true };
}
