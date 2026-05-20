import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

type SearchParams = {
  current?: string;
};

const UNGROUPED_KEY = "__ungrouped__";
const UNGROUPED_LABEL = "Ungrouped";

export default async function BikeTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const showAllVersions = sp.current === "all";

  const supabase = await createClient();
  let q = supabase
    .from("bike_templates")
    .select(
      `
        id,
        name_en,
        name_da,
        family,
        frame_size,
        version,
        is_current,
        default_retail_price,
        default_retail_currency,
        created_at,
        bike_type:bike_types(id, name_en)
      `,
    )
    .order("family", { ascending: true, nullsFirst: false })
    .order("frame_size", { ascending: true })
    .order("version", { ascending: false });

  if (!showAllVersions) {
    q = q.eq("is_current", true);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`Failed to load templates: ${error.message}`);
  }

  const rows = data ?? [];
  const partCountsRes = await supabase
    .from("bike_template_parts")
    .select("template_id");
  const partCountByTemplate = new Map<string, number>();
  for (const row of partCountsRes.data ?? []) {
    partCountByTemplate.set(
      row.template_id,
      (partCountByTemplate.get(row.template_id) ?? 0) + 1,
    );
  }

  // Group rows by family — null family lands in an "Ungrouped" bucket at the end.
  type Row = (typeof rows)[number];
  const groups = new Map<string, { label: string; rows: Row[] }>();
  for (const r of rows) {
    const key = r.family ? r.family : UNGROUPED_KEY;
    const label = r.family ?? UNGROUPED_LABEL;
    const entry = groups.get(key) ?? { label, rows: [] };
    entry.rows.push(r);
    groups.set(key, entry);
  }
  const orderedGroupKeys = [...groups.keys()]
    .filter((k) => k !== UNGROUPED_KEY)
    .sort((a, b) => groups.get(a)!.label.localeCompare(groups.get(b)!.label));
  if (groups.has(UNGROUPED_KEY)) orderedGroupKeys.push(UNGROUPED_KEY);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Bike templates</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Bike templates
            </h1>
            <p className="text-muted-foreground text-sm">
              {rows.length}{" "}
              {showAllVersions
                ? "templates (all versions)"
                : "current templates"}
              {" · "}
              <Link
                href={
                  showAllVersions
                    ? "/bike-templates"
                    : "/bike-templates?current=all"
                }
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                {showAllVersions ? "current only" : "show all versions"}
              </Link>
            </p>
          </div>
          <Button asChild>
            <Link href="/bike-templates/new">
              <Plus aria-hidden /> Add template
            </Link>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No templates yet"
          description="Templates are the product catalog. Create one for each frame size of each bike — color is picked at order time."
          action={{ label: "Add template", href: "/bike-templates/new" }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {orderedGroupKeys.map((key) => {
            const group = groups.get(key)!;
            return (
              <section key={key} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <span className="text-muted-foreground text-xs">
                    {group.rows.length}{" "}
                    {group.rows.length === 1 ? "template" : "templates"}
                  </span>
                </div>
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Retail</TableHead>
                        <TableHead className="text-right">Version</TableHead>
                        <TableHead className="text-right">Parts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((t) => (
                        <TableRow
                          key={t.id}
                          className="hover:bg-muted/50 cursor-pointer"
                        >
                          <TableCell className="p-0">
                            <Link
                              href={`/bike-templates/${t.id}`}
                              className="block px-4 py-2.5"
                            >
                              <div className="font-medium">{t.name_en}</div>
                              {t.name_da && t.name_da !== t.name_en ? (
                                <div className="text-muted-foreground text-xs">
                                  {t.name_da}
                                </div>
                              ) : null}
                            </Link>
                          </TableCell>
                          <TableCell className="p-0 text-sm tabular-nums">
                            <Link
                              href={`/bike-templates/${t.id}`}
                              className="block px-4 py-2.5"
                            >
                              {t.frame_size}
                            </Link>
                          </TableCell>
                          <TableCell className="p-0">
                            <Link
                              href={`/bike-templates/${t.id}`}
                              className="block px-4 py-2.5"
                            >
                              <Badge variant="outline" className="font-normal">
                                {t.bike_type?.name_en ?? "—"}
                              </Badge>
                            </Link>
                          </TableCell>
                          <TableCell className="p-0 text-right text-sm tabular-nums">
                            <Link
                              href={`/bike-templates/${t.id}`}
                              className="block px-4 py-2.5"
                            >
                              {formatPrice(
                                t.default_retail_price == null
                                  ? null
                                  : Number(t.default_retail_price),
                                t.default_retail_currency,
                              )}
                            </Link>
                          </TableCell>
                          <TableCell className="p-0 text-right tabular-nums">
                            <Link
                              href={`/bike-templates/${t.id}`}
                              className="block px-4 py-2.5"
                            >
                              v{t.version}
                              {t.is_current ? (
                                <Badge variant="success" className="ml-2">
                                  current
                                </Badge>
                              ) : null}
                            </Link>
                          </TableCell>
                          <TableCell className="p-0 text-right tabular-nums">
                            <Link
                              href={`/bike-templates/${t.id}`}
                              className="block px-4 py-2.5"
                            >
                              {partCountByTemplate.get(t.id) ?? 0}
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
