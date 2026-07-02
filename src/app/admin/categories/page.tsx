import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";

import {
  CategoriesSection,
  type CategoryRow,
} from "./_components/categories-section";
import { buildTreeRows, type CategoryInput } from "./_lib/tree";

export default async function CategoriesPage() {
  const supabase = await createClient();

  const [catsRes, partCountsRes] = await Promise.all([
    supabase
      .from("part_categories")
      .select("id, name_en, name_da, parent_id, is_active, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    // Parts directly in each category — a "this is in use" hint on the row.
    supabase
      .from("parts")
      .select("category_id")
      .not("category_id", "is", null)
      .is("deleted_at", null),
  ]);

  if (catsRes.error) {
    throw new Error(`Failed to load categories: ${catsRes.error.message}`);
  }

  const partCounts = new Map<string, number>();
  for (const row of partCountsRes.data ?? []) {
    if (!row.category_id) continue;
    partCounts.set(row.category_id, (partCounts.get(row.category_id) ?? 0) + 1);
  }

  const cats = (catsRes.data ?? []) as CategoryInput[];
  const rows: CategoryRow[] = buildTreeRows(cats).map((c) => ({
    id: c.id,
    name_en: c.name_en,
    name_da: c.name_da,
    depth: c.depth,
    isActive: c.is_active,
    partCount: partCounts.get(c.id) ?? 0,
    sortOrder: c.sort_order ?? 0,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">Admin</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Part categories</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Part categories</h1>
        <p className="text-muted-foreground text-sm">
          The hierarchy parts are classified under. Every part carries one
          category. Archiving hides a category from new-part pickers and the
          parts filter while leaving existing parts classified.
        </p>
      </header>

      <CategoriesSection rows={rows} />
    </div>
  );
}
