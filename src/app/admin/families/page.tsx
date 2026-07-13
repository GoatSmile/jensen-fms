import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
  const [t, tCommon] = await Promise.all([
    getTranslations("adminFamilies"),
    getTranslations("common"),
  ]);

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
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <section className="rounded-md border">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{t("sectionTitle")}</h2>
            <span className="text-muted-foreground text-xs">
              {t("countSummary", { active: activeCount, total: rows.length })}
            </span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/families/new">
              <Plus aria-hidden /> {t("newFamily")}
            </Link>
          </Button>
        </header>

        {rows.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm italic">
            {t("emptyState")}
          </p>
        ) : (
          <div className="overflow-x-auto md:overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colFamily")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    {t("colSort")}
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    {t("colTemplates")}
                  </TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
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
                            <Badge variant="success">{t("statusActive")}</Badge>
                          ) : (
                            <Badge variant="outline">
                              {t("statusArchived")}
                            </Badge>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="p-0 text-right">
                        <Link
                          href={href}
                          className="text-muted-foreground block px-3 py-2.5"
                          aria-label={t("openAria", { name: row.name })}
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
