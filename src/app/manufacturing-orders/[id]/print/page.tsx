import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";

import { localizedName } from "@/i18n/vocab";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatDkk, formatQuantity } from "@/lib/parts/stock";

import { PrintButton } from "@/app/parts/print/_components/print-button";

export const dynamic = "force-dynamic";

/**
 * Print-friendly parts list for one manufacturing order. Renders the recipe
 * grouped by category, with qty/bike + total needed (× outstanding bikes) +
 * on-hand + shortfall + last cost. Designed for paper: no nav chrome,
 * monochrome, generous padding. Sidebar/FAB hidden via globals.css @media print.
 */
export default async function MOPartsPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tStatus, locale] = await Promise.all([
    getTranslations("moDetail"),
    getTranslations("moStatus"),
    getLocale(),
  ]);
  const supabase = await createClient();

  const moRes = await supabase
    .from("manufacturing_orders")
    .select(
      `id, mo_number, target_quantity, completed_quantity, status,
       planned_completion_date,
       bike_type:bike_types(name_en, name_da),
       bike_template:bike_templates(name_en, family:bike_families(name), frame_size, version),
       color:colors(name_en, name_da)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (moRes.error) throw new Error(moRes.error.message);
  if (!moRes.data) notFound();
  const mo = moRes.data;

  const [partsRes, bikesRes] = await Promise.all([
    supabase
      .from("manufacturing_order_parts")
      .select(
        `id, part_id, quantity_per_bike, origin, notes,
         part:parts!part_id(
           id, internal_sku, name_en,
           category:part_categories(id, name_en, name_da, sort_order)
         ),
         substituted_from:parts!substituted_part_id(internal_sku, name_en)`,
      )
      .eq("manufacturing_order_id", id),
    supabase
      .from("bikes")
      .select("id")
      .eq("manufacturing_order_id", id)
      .is("deleted_at", null),
  ]);
  const rows = partsRes.data ?? [];
  const attachedBikes = bikesRes.data?.length ?? 0;
  const outstandingBikes = Math.max(0, mo.target_quantity - attachedBikes);

  // Stock + last cost in one round-trip each.
  const partIds = rows
    .map((r) => r.part_id)
    .filter((x): x is string => x != null);
  const stockByPart = new Map<string, number>();
  const lastCostByPart = new Map<string, number>();
  if (partIds.length > 0) {
    const [stockRes, costRes] = await Promise.all([
      supabase
        .from("v_current_stock")
        .select("part_id, quantity_on_hand")
        .in("part_id", partIds),
      supabase
        .from("v_part_last_cost")
        .select("part_id, last_cost_dkk")
        .in("part_id", partIds),
    ]);
    for (const s of stockRes.data ?? []) {
      if (!s.part_id) continue;
      stockByPart.set(
        s.part_id,
        (stockByPart.get(s.part_id) ?? 0) + Number(s.quantity_on_hand ?? 0),
      );
    }
    for (const c of costRes.data ?? []) {
      if (!c.part_id) continue;
      lastCostByPart.set(c.part_id, Number(c.last_cost_dkk ?? 0));
    }
  }

  // Group rows by category, ordering by the category's sort_order so the
  // printout mirrors the on-screen recipe order.
  type Group = {
    categoryName: string;
    sortOrder: number;
    rows: typeof rows;
  };
  const groupsByCat = new Map<string, Group>();
  for (const r of rows) {
    const cat = r.part?.category;
    const key = cat?.id ?? "__uncategorised__";
    if (!groupsByCat.has(key)) {
      groupsByCat.set(key, {
        categoryName: cat
          ? localizedName(locale, cat.name_en, cat.name_da)
          : "Uncategorised",
        sortOrder: cat?.sort_order ?? 9999,
        rows: [],
      });
    }
    groupsByCat.get(key)!.rows.push(r);
  }
  const groups = [...groupsByCat.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const templateLabel = mo.bike_template
    ? [
        mo.bike_template.family?.name,
        mo.bike_template.frame_size,
        mo.bike_template.name_en,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const totalNeededAll = rows.reduce(
    (sum, r) => sum + Number(r.quantity_per_bike) * outstandingBikes,
    0,
  );
  const totalCostAll = rows.reduce(
    (sum, r) =>
      sum +
      Number(r.quantity_per_bike) *
        outstandingBikes *
        (lastCostByPart.get(r.part_id) ?? 0),
    0,
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 print:p-0">
      <header className="flex items-start justify-between gap-4 print:items-end">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">
            {t("printMoPrefix")}{" "}
            <span className="font-mono">{mo.mo_number}</span>
            {mo.status
              ? ` · ${tStatus.has(mo.status) ? tStatus(mo.status) : mo.status}`
              : null}
          </p>
          <h1 className="text-2xl font-semibold">
            {t("printPartsListTitle", {
              label: templateLabel ?? t("printOneOffLabel"),
            })}
          </h1>
          <p className="text-muted-foreground text-sm">
            {mo.bike_type
              ? `${localizedName(locale, mo.bike_type.name_en, mo.bike_type.name_da)} · `
              : ""}
            {mo.color
              ? `${localizedName(locale, mo.color.name_en, mo.color.name_da)} · `
              : ""}
            {t("printTargetBikes", { count: mo.target_quantity })} ·{" "}
            {t("printAttached", { count: attachedBikes })} ·{" "}
            {t("printOutstanding", { count: outstandingBikes })}
            {mo.planned_completion_date ? (
              <>
                {" · "}
                {t("printPlannedCompletion", {
                  date: formatDate(mo.planned_completion_date),
                })}
              </>
            ) : null}
          </p>
        </div>
        <PrintButton />
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground italic">{t("printNoParts")}</p>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.categoryName} className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {g.categoryName}
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("printThPart")}</TableHead>
                    <TableHead className="text-right">
                      {t("printThQtyBike")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("printThTotal", { count: outstandingBikes })}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("printThOnHand")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("printThShortfall")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("printThLastCost")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rows.map((r) => {
                    const qty = Number(r.quantity_per_bike);
                    const totalNeeded = qty * outstandingBikes;
                    const onHand = stockByPart.get(r.part_id) ?? 0;
                    const shortfall = Math.max(0, totalNeeded - onHand);
                    const lastCost = lastCostByPart.get(r.part_id) ?? 0;
                    const originKey = `origin${r.origin.charAt(0).toUpperCase()}${r.origin.slice(1)}`;
                    const originLabel = t.has(originKey)
                      ? t(originKey)
                      : r.origin;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">
                            {r.part?.name_en ?? "—"}
                          </div>
                          <div className="text-muted-foreground font-mono text-xs">
                            {r.part?.internal_sku ?? "—"}
                            {r.origin !== "template" ? ` · ${originLabel}` : ""}
                          </div>
                          {r.substituted_from?.name_en ? (
                            <div className="text-muted-foreground text-xs italic">
                              {t("replaces", {
                                name: r.substituted_from.name_en,
                              })}
                            </div>
                          ) : null}
                          {r.notes ? (
                            <div className="text-muted-foreground text-xs">
                              {r.notes}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(qty)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(totalNeeded)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(onHand)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            shortfall > 0 ? "font-semibold" : ""
                          }`}
                        >
                          {shortfall > 0 ? formatQuantity(shortfall) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {lastCost > 0 ? formatDkk(lastCost * qty) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          ))}

          <section className="rounded-md border bg-muted/30 p-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs uppercase">
                  {t("printDistinctParts")}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {rows.length}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs uppercase">
                  {t("printUnitsNeeded")}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatQuantity(totalNeededAll)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs uppercase">
                  {t("printProjectedCost")}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {totalCostAll > 0 ? formatDkk(totalCostAll) : "—"}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      <footer className="text-muted-foreground mt-4 text-xs print:fixed print:bottom-4 print:right-6">
        {t("printGenerated", {
          date: new Intl.DateTimeFormat("da-DK", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date()),
        })}
      </footer>
    </div>
  );
}
