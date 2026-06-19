import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";

import { ArchiveButton } from "../_components/archive-button";
import {
  CategoryForm,
  type CategoryFormValues,
} from "../_components/category-form";
import { buildParentOptions, type CategoryInput } from "../_lib/tree";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [catRes, allCatsRes, partsRes] = await Promise.all([
    supabase
      .from("part_categories")
      .select(
        "id, name_en, name_da, parent_id, description_en, description_da, sort_order, is_active",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("part_categories")
      .select("id, name_en, name_da, parent_id, is_active")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("parts")
      .select("id, internal_sku, name_en")
      .eq("category_id", id)
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
  ]);

  if (catRes.error) {
    throw new Error(`Failed to load category: ${catRes.error.message}`);
  }
  if (!catRes.data) notFound();

  const c = catRes.data;
  const allCats = (allCatsRes.data ?? []) as CategoryInput[];
  const parentOptions = buildParentOptions(allCats, c.id);
  const childCount = allCats.filter((x) => x.parent_id === c.id).length;
  const parts = partsRes.data ?? [];
  const partCount = parts.length;

  const initial: CategoryFormValues = {
    name_en: c.name_en,
    name_da: c.name_da ?? "",
    parent_id: c.parent_id ?? "",
    description_en: c.description_en ?? "",
    description_da: c.description_da ?? "",
    sort_order: String(c.sort_order ?? 0),
    is_active: c.is_active,
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
            <BreadcrumbLink asChild>
              <Link href="/admin/categories">Part categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{c.name_en}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold">{c.name_en}</h1>
          {c.name_da ? (
            <p className="text-muted-foreground text-sm">{c.name_da}</p>
          ) : null}
        </div>
        <Badge variant={c.is_active ? "success" : "outline"}>
          {c.is_active ? "Active" : "Archived"}
        </Badge>
      </header>

      <CategoryForm
        mode={{ kind: "edit", id: c.id }}
        initial={initial}
        parentOptions={parentOptions}
      />

      <section className="rounded-md border">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Parts in this category</h2>
          <span className="text-muted-foreground text-xs">
            {partCount} part{partCount === 1 ? "" : "s"}
          </span>
        </header>
        {partCount === 0 ? (
          <p className="text-muted-foreground p-4 text-sm italic">
            No parts are classified directly under this category yet.
          </p>
        ) : (
          <ul className="divide-y">
            {parts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/parts/${p.id}`}
                  className="hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-2.5 transition-colors"
                >
                  <div className="flex min-w-0 flex-col">
                    <SegmentedId value={p.internal_sku} className="text-xs" />
                    <span className="text-muted-foreground truncate text-sm">
                      {p.name_en}
                    </span>
                  </div>
                  <ChevronRight
                    className="text-muted-foreground/60 size-4 shrink-0"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ArchiveButton
        id={c.id}
        isActive={c.is_active}
        partCount={partCount}
        childCount={childCount}
      />
    </div>
  );
}
