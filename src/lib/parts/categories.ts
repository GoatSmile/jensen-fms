/**
 * Hierarchical category helpers. Pure functions over a flat list of
 * `(id, name_en, parent_id)` rows — the tree is small enough to build and
 * walk in memory, no recursive SQL needed.
 */
import { localizedName } from "@/i18n/vocab";

export type FlatCategory = {
  id: string;
  name_en: string | null;
  name_da?: string | null;
  parent_id: string | null;
};

export type CategoryNode = {
  id: string;
  name: string;
  /** Full label path, root → leaf. */
  path: string[];
  /** 0 for root, 1 for children, etc. */
  depth: number;
  parent_id: string | null;
};

/**
 * Arrange categories into a stable depth-first order: parent before children,
 * siblings in the order the rows arrive (callers query
 * `ORDER BY sort_order, name_en` — the workshop's canonical build order, same
 * as the template recipe page), with `depth` and `path` precomputed for the UI.
 */
export function flattenCategoryTree(
  rows: FlatCategory[],
  locale = "en",
): CategoryNode[] {
  const label = (r: FlatCategory) =>
    localizedName(locale, r.name_en, r.name_da) || "—";
  const byId = new Map<string, FlatCategory>();
  for (const r of rows) byId.set(r.id, r);

  const childrenByParent = new Map<string | null, FlatCategory[]>();
  for (const r of rows) {
    const k = r.parent_id;
    const list = childrenByParent.get(k);
    if (list) list.push(r);
    else childrenByParent.set(k, [r]);
  }

  const out: CategoryNode[] = [];
  function walk(node: FlatCategory, ancestry: string[]) {
    const name = label(node);
    const path = [...ancestry, name];
    out.push({
      id: node.id,
      name,
      path,
      depth: ancestry.length,
      parent_id: node.parent_id,
    });
    for (const child of childrenByParent.get(node.id) ?? []) walk(child, path);
  }
  for (const root of childrenByParent.get(null) ?? []) walk(root, []);

  // Orphans (parent_id refers to a missing category) — render at the bottom
  // at depth 0 so they don't disappear.
  const seen = new Set(out.map((n) => n.id));
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    out.push({
      id: r.id,
      name: label(r),
      path: [label(r)],
      depth: 0,
      parent_id: r.parent_id,
    });
  }
  return out;
}

/**
 * Given a category id, return the set of ids of itself + all descendants.
 * Used to translate a "filter by parent X" click into an SQL `category_id in (...)`.
 */
export function descendantIds(
  rows: FlatCategory[],
  rootId: string,
): string[] {
  const childrenByParent = new Map<string | null, FlatCategory[]>();
  for (const r of rows) {
    const k = r.parent_id;
    const list = childrenByParent.get(k);
    if (list) list.push(r);
    else childrenByParent.set(k, [r]);
  }
  const out: string[] = [];
  const queue: string[] = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const child of childrenByParent.get(id) ?? []) queue.push(child.id);
  }
  return out;
}
