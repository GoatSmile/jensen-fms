import type { ParentOption } from "../_components/category-form";

/** Minimal shape both the list and the form-prep need. */
export type CategoryInput = {
  id: string;
  name_en: string;
  name_da: string | null;
  parent_id: string | null;
  is_active: boolean;
};

export type CategoryTreeRow = CategoryInput & { depth: number };

const NBSP = "    ";

function childrenOf(cats: CategoryInput[], parentId: string | null) {
  return cats
    .filter((c) => (c.parent_id ?? null) === parentId)
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
}

/**
 * Depth-first flatten: roots alphabetical, each followed by its children
 * indented one level. The tree is shallow in practice, but this handles
 * arbitrary depth.
 */
export function buildTreeRows(cats: CategoryInput[]): CategoryTreeRow[] {
  const out: CategoryTreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of childrenOf(cats, parentId)) {
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** ids of every descendant of `rootId` (not including rootId itself). */
export function descendantIds(
  cats: CategoryInput[],
  rootId: string,
): Set<string> {
  const out = new Set<string>();
  const walk = (parentId: string) => {
    for (const c of cats.filter((x) => x.parent_id === parentId)) {
      if (out.has(c.id)) continue;
      out.add(c.id);
      walk(c.id);
    }
  };
  walk(rootId);
  return out;
}

/**
 * Parent-picker options: every category, indented by depth, minus the
 * category being edited and its descendants (which would form a cycle).
 * Archived categories are tagged so the admin isn't surprised.
 */
export function buildParentOptions(
  cats: CategoryInput[],
  excludeId?: string,
): ParentOption[] {
  const blocked = new Set<string>();
  if (excludeId) {
    blocked.add(excludeId);
    for (const id of descendantIds(cats, excludeId)) blocked.add(id);
  }
  return buildTreeRows(cats)
    .filter((r) => !blocked.has(r.id))
    .map((r) => ({
      id: r.id,
      label: `${NBSP.repeat(r.depth)}${r.name_en}${r.is_active ? "" : " (archived)"}`,
    }));
}
