import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

import { PrintButton } from "./_components/print-button";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  category?: string;
  stock?: "ok" | "low" | "out";
};

function todayDa(): string {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

/**
 * Print-friendly parts catalog. Renders the current parts list as a clean
 * paper-oriented table — no nav chrome, no actions, no filter UI. The
 * sidebar / mobile nav are hidden globally for any print media via rules in
 * globals.css.
 *
 * Filter params (`q`, `category`, `stock`) round-trip from the regular
 * /parts page so "filter on screen → click Print → print only what you see"
 * is the intended workflow. The filter summary line below the title makes
 * the printed report self-describing.
 */
export default async function PartsPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  let q = supabase
    .from("v_parts_dashboard")
    .select(
      `id, internal_sku, name_en, category_name, primary_supplier_name,
       stock_on_hand, last_cost_dkk, stock_status, reorder_point`,
    )
    .is("deleted_at", null)
    .order("internal_sku", { ascending: true });

  if (sp.q) {
    const escaped = sp.q.replace(/[,%]/g, " ").trim();
    if (escaped) {
      q = q.or(
        `internal_sku.ilike.%${escaped}%,name_en.ilike.%${escaped}%`,
      );
    }
  }
  if (sp.category) {
    q = q.eq("category_name", sp.category);
  }
  if (sp.stock) {
    q = q.eq("stock_status", sp.stock);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`Failed to load parts: ${error.message}`);
  }

  const rows = data ?? [];

  const filterDescription = [
    sp.q ? `matching "${sp.q}"` : null,
    sp.category ? `in ${sp.category}` : null,
    sp.stock ? `stock status: ${sp.stock}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-6 p-6 print:p-0">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Parts catalog
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {rows.length} {rows.length === 1 ? "part" : "parts"}
            {filterDescription ? ` · ${filterDescription}` : null}
            {" · "}
            Printed {todayDa()}
          </p>
        </div>
        <PrintButton />
      </header>

      <div className="overflow-hidden rounded-md border print:rounded-none print:border-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Reorder</TableHead>
              <TableHead className="text-right">Last cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">
                  {p.internal_sku}
                </TableCell>
                <TableCell className="font-medium">{p.name_en}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.category_name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.primary_supplier_name ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Math.trunc(Number(p.stock_on_hand ?? 0))}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {p.reorder_point == null
                    ? "—"
                    : Math.trunc(Number(p.reorder_point))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPrice(
                    p.last_cost_dkk == null ? null : Number(p.last_cost_dkk),
                    "DKK",
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-center text-sm">
          No parts match the current filters.
        </p>
      ) : null}

      <footer className="text-muted-foreground mt-4 text-xs print-only">
        Jensen Production — Kvalitetscykler · Generated {todayDa()}
      </footer>
    </div>
  );
}

