import Link from "next/link";
import { Plus } from "lucide-react";

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
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  current?: string;
};

function formatPrice(
  amount: number | null,
  currency: string | null,
): string {
  if (amount == null || !currency) return "—";
  if (currency === "DKK") {
    return `${new Intl.NumberFormat("da-DK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)} kr.`;
  }
  return `${new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

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
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
          No templates yet. Templates are the product catalog — each template
          is one bike with a fixed frame size; color is picked at order time.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Retail</TableHead>
                <TableHead className="text-right">Version</TableHead>
                <TableHead className="text-right">Parts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
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
                  <TableCell className="p-0 text-sm">
                    <Link
                      href={`/bike-templates/${t.id}`}
                      className="block px-4 py-2.5"
                    >
                      {t.family ?? "—"}
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
      )}
    </div>
  );
}
