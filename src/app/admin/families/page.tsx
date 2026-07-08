import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { familyTint } from "@/lib/bike-templates/family-colors";

export default async function AdminFamiliesPage() {
  const supabase = await createClient();

  const [familiesRes, templatesRes] = await Promise.all([
    supabase
      .from("bike_families")
      .select("id, name, sort_order, is_active")
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("bike_templates")
      .select("family_id")
      .not("family_id", "is", null),
  ]);

  if (familiesRes.error) {
    throw new Error(`Failed to load families: ${familiesRes.error.message}`);
  }

  // Templates per family (all versions), so archiving a still-referenced
  // family is an informed choice.
  const usageById = new Map<string, number>();
  for (const t of templatesRes.data ?? []) {
    if (!t.family_id) continue;
    usageById.set(t.family_id, (usageById.get(t.family_id) ?? 0) + 1);
  }

  const rows = familiesRes.data ?? [];
  const activeCount = rows.filter((r) => r.is_active).length;

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
            <BreadcrumbPage>Families</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Families</h1>
        <p className="text-muted-foreground text-sm">
          Product families group bike templates on the templates list (e.g.
          &ldquo;Norma&rdquo; over its sizes). Order them with the sort field;
          archived families drop out of the template picker but keep their
          existing templates grouped.
        </p>
      </header>

      <section className="rounded-md border">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">Families</h2>
            <span className="text-muted-foreground text-xs">
              {activeCount} active · {rows.length} total
            </span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/families/new">
              <Plus aria-hidden /> New family
            </Link>
          </Button>
        </header>

        {rows.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm italic">
            No families yet. Add one to start grouping templates.
          </p>
        ) : (
          <div className="overflow-x-auto md:overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Family</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Sort
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Templates
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[36px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const href = `/admin/families/${row.id}`;
                  return (
                    <TableRow
                      key={row.id}
                      className={`hover:bg-muted/50 cursor-pointer ${row.is_active ? "" : "opacity-60"}`}
                    >
                      <TableCell className="p-0 font-medium">
                        <Link
                          href={href}
                          className="flex items-center gap-2 px-4 py-2.5"
                        >
                          {/* The family's app-wide hue (templates list, MO
                              batch cards, detail chip) — shown here so the
                              admin doubles as the colour legend. */}
                          <span
                            className={`size-2 shrink-0 rounded-full ${familyTint(row.id).dot}`}
                            aria-hidden
                          />
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden p-0 text-right tabular-nums md:table-cell">
                        <Link href={href} className="block px-4 py-2.5">
                          {row.sort_order}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden p-0 text-right tabular-nums lg:table-cell">
                        <Link href={href} className="block px-4 py-2.5">
                          {usageById.get(row.id) ?? 0}
                        </Link>
                      </TableCell>
                      <TableCell className="p-0">
                        <Link href={href} className="block px-4 py-2.5">
                          {row.is_active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="outline">Archived</Badge>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="p-0 text-right">
                        <Link
                          href={href}
                          className="text-muted-foreground block px-3 py-2.5"
                          aria-label={`Open ${row.name}`}
                        >
                          <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
