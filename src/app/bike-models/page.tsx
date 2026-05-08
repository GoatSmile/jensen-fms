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
import { formatMoney } from "@/lib/parts/format";

export default async function BikeModelsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bike_models")
    .select(
      `
        id,
        name_en,
        name_da,
        manufacturer,
        model_year,
        headline_retail_price,
        headline_currency,
        frame_number_code,
        deleted_at,
        bike_type:bike_types(id, name_en)
      `,
    )
    .order("name_en", { ascending: true });

  if (error) {
    throw new Error(`Failed to load bike models: ${error.message}`);
  }

  const rows = data ?? [];
  const activeCount = rows.filter((r) => r.deleted_at == null).length;

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
              <BreadcrumbPage>Bike models</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Bike models
            </h1>
            <p className="text-muted-foreground text-sm">
              {activeCount} active
              {rows.length !== activeCount
                ? ` · ${rows.length - activeCount} retired`
                : ""}
            </p>
          </div>
          <Button asChild>
            <Link href="/bike-models/new">
              <Plus aria-hidden /> Add model
            </Link>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
          No bike models yet. Add one to start defining variants and templates.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Frame code</TableHead>
                <TableHead className="text-right">Headline price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                const isRetired = m.deleted_at != null;
                return (
                  <TableRow
                    key={m.id}
                    className={`hover:bg-muted/50 cursor-pointer ${isRetired ? "opacity-60" : ""}`}
                  >
                    <TableCell className="p-0">
                      <Link
                        href={`/bike-models/${m.id}`}
                        className="block px-4 py-2.5"
                      >
                        <div className="font-medium">{m.name_en}</div>
                        {m.name_da && m.name_da !== m.name_en ? (
                          <div className="text-muted-foreground text-xs">
                            {m.name_da}
                          </div>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link
                        href={`/bike-models/${m.id}`}
                        className="block px-4 py-2.5"
                      >
                        <Badge variant="outline" className="font-normal">
                          {m.bike_type?.name_en ?? "—"}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground p-0 text-sm">
                      <Link
                        href={`/bike-models/${m.id}`}
                        className="block px-4 py-2.5"
                      >
                        {m.manufacturer ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground p-0 text-sm tabular-nums">
                      <Link
                        href={`/bike-models/${m.id}`}
                        className="block px-4 py-2.5"
                      >
                        {m.model_year ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 font-mono text-xs">
                      <Link
                        href={`/bike-models/${m.id}`}
                        className="block px-4 py-2.5"
                      >
                        {m.frame_number_code ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right tabular-nums">
                      <Link
                        href={`/bike-models/${m.id}`}
                        className="block px-4 py-2.5"
                      >
                        {formatMoney(
                          m.headline_retail_price != null
                            ? Number(m.headline_retail_price)
                            : null,
                          m.headline_currency,
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link
                        href={`/bike-models/${m.id}`}
                        className="block px-4 py-2.5"
                      >
                        {isRetired ? (
                          <Badge variant="destructive">Retired</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
