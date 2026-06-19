"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type CategoryResult = { ok: true } | { ok: false; error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

type ParsedCategory = {
  name_en: string;
  name_da: string | null;
  parent_id: string | null;
  description_en: string | null;
  description_da: string | null;
  sort_order: number;
  is_active: boolean;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slug is auto-generated from the name and never shown to the user — so we
 * make it collision-safe here rather than bounce a 23505 back. Picks the
 * bare slug if free, else the lowest `-N` suffix that isn't taken.
 */
async function freeSlug(
  supabase: Supabase,
  base: string,
): Promise<string> {
  const root = base || "category";
  // PostgREST `.or()` uses `*` as the LIKE wildcard (it maps to SQL `%`).
  const { data } = await supabase
    .from("part_categories")
    .select("slug")
    .or(`slug.eq.${root},slug.like.${root}-*`);
  const taken = new Set((data ?? []).map((r) => r.slug as string));
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

/**
 * True when `candidateParentId` is `id` itself or sits below it in the tree —
 * i.e. choosing it as parent would create a cycle. Walks up from the
 * candidate; if we reach `id`, the candidate is a descendant of it.
 */
async function wouldCycle(
  supabase: Supabase,
  id: string,
  candidateParentId: string,
): Promise<boolean> {
  if (candidateParentId === id) return true;
  const { data } = await supabase
    .from("part_categories")
    .select("id, parent_id");
  const parentOf = new Map(
    (data ?? []).map((c) => [c.id as string, c.parent_id as string | null]),
  );
  let cur: string | null = candidateParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

function parseFormData(
  formData: FormData,
): { ok: true; values: ParsedCategory } | { ok: false; error: string } {
  const name_en = nullable(formData.get("name_en"))?.trim();
  if (!name_en) return { ok: false, error: "English name is required." };

  const name_da = nullable(formData.get("name_da"));
  const parent_id = nullable(formData.get("parent_id"));
  const description_en = nullable(formData.get("description_en"));
  const description_da = nullable(formData.get("description_da"));

  const sortOrderRaw = nullable(formData.get("sort_order"));
  let sort_order = 0;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Sort order must be a number." };
    }
    sort_order = Math.trunc(n);
  }

  return {
    ok: true,
    values: {
      name_en,
      name_da,
      parent_id,
      description_en,
      description_da,
      sort_order,
      is_active: formData.get("is_active") === "on",
    },
  };
}

export async function createCategory(
  formData: FormData,
): Promise<CategoryResult> {
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const slug = await freeSlug(supabase, slugify(parsed.values.name_en));

  const { error } = await supabase
    .from("part_categories")
    .insert({ ...parsed.values, slug });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A category with that slug already exists." };
    }
    return { ok: false, error: `Could not create: ${error.message}` };
  }
  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateCategory(
  id: string,
  formData: FormData,
): Promise<CategoryResult> {
  if (!id) return { ok: false, error: "Missing id." };
  const parsed = parseFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();

  if (
    parsed.values.parent_id &&
    (await wouldCycle(supabase, id, parsed.values.parent_id))
  ) {
    return {
      ok: false,
      error: "A category can't be its own parent or a child of its descendants.",
    };
  }

  // Slug stays stable across renames — it's an internal identifier, and
  // nothing keys off the name. (parts reference category_id, not slug.)
  const { error } = await supabase
    .from("part_categories")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: `Could not update: ${error.message}` };
  }
  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Toggle active. Soft-archive only — parts referencing this category keep
 * their link; pickers hide archived rows. Mirrors the controlled-vocab
 * archive convention (colors / hs-codes / suppliers). Does not touch
 * deleted_at (archived ≠ deleted).
 */
export async function setCategoryActive(
  id: string,
  isActive: boolean,
): Promise<CategoryResult> {
  if (!id) return { ok: false, error: "Missing id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("part_categories")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: `Could not save: ${error.message}` };
  }
  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  return { ok: true };
}
