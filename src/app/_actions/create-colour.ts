"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readAllowedCaps } from "@/lib/auth/read-session";
import { normaliseRalCode, ralToHex } from "@/lib/colors/ral";
import { slugify } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type CreateColourInlineResult =
  | { ok: true; id: string; nameEn: string; nameDa: string; hex: string | null }
  | { ok: false; error: string };

/**
 * Create a colour from wherever a colour is being PICKED, rather than sending
 * the user to Admin → Lists → Colours and back.
 *
 * Why this exists: recording painted stock the shop already owns needs a
 * colour, and blocking on "go make it first" buys nothing — the admin form
 * requires only a name too (`ral_code`, `coating` and `hex` are all nullable,
 * and hex is derived from RAL when given). So the detour was pure friction, and
 * it is on record as the owner's own complaint. What IS deliberate is that a
 * colour must be a real `colors` row and never free text on a movement; that
 * holds here (DECISIONS 2026-09-03).
 *
 * **Gated on `admin` on purpose.** `/admin` is where colours live, so vocabulary
 * is an admin capability; `createColor` in the admin actions carries no check of
 * its own because its ROUTE is the gate. Called from a part page — gated on
 * `parts` — that would hand vocab-writing to anyone who can count stock, on a
 * table nine others reference and where a bad row can be archived but never
 * really removed. A caller without `admin` is refused here as well as hidden in
 * the UI. `null` caps means the gate is off entirely (local dev).
 *
 * FIRST INSTANCE OF THIS PATTERN in the app — no other picker creates a vocab
 * row. Kits and part categories will want the same thing; when the second one
 * arrives, generalise rather than copying this file.
 */
export async function createColourInline(input: {
  nameEn: string;
  nameDa: string | null;
  ralCode: string | null;
  coating: string | null;
}): Promise<CreateColourInlineResult> {
  const t = await getTranslations("errors");

  const caps = await readAllowedCaps();
  if (caps !== null && !caps.includes("admin")) {
    return { ok: false, error: t("colourNeedsAdmin") };
  }

  const nameEn = input.nameEn.trim();
  if (!nameEn) return { ok: false, error: t("englishNameRequired") };
  const nameDa = input.nameDa?.trim() || nameEn;
  const slug = slugify(nameEn);
  if (!slug) return { ok: false, error: t("adminSlugFromName") };

  // Same gate as the admin form — a colour created from a picker must not be
  // able to carry a code the admin form would refuse.
  const ralRaw = input.ralCode?.trim() || null;
  const ralCode = ralRaw ? normaliseRalCode(ralRaw) : null;
  if (ralRaw && !ralCode) {
    return { ok: false, error: t("adminColorRalUnknown", { code: ralRaw }) };
  }
  const coating = input.coating?.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("colors")
    .insert({
      name_en: nameEn,
      name_da: nameDa,
      slug,
      // Same derivation the admin form uses, so a RAL typed here yields the
      // same swatch it would there.
      hex: ralCode ? ralToHex(ralCode) : null,
      ral_code: ralCode,
      coating,
    })
    .select("id, name_en, name_da, hex")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: t("adminColorSlugExists") };
    }
    return {
      ok: false,
      error: t("couldNotCreate", { detail: error?.message ?? t("unknownError") }),
    };
  }

  revalidatePath("/admin/lists");
  return {
    ok: true,
    id: data.id,
    nameEn: data.name_en,
    nameDa: data.name_da,
    hex: data.hex,
  };
}
