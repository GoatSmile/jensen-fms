import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Paintbrush } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColorChip } from "@/components/color-swatch";
import { EmptyState } from "@/components/empty-state";
import { localizedName } from "@/i18n/vocab";
import { formatQuantity } from "@/lib/parts/stock";
import {
  loadPaintedDemand,
  loadPaintedStockLookup,
} from "@/lib/parts/painted-variants";
import { FILTER_ACTIVE_CLASS } from "@/lib/filter-style";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import { cn } from "@/lib/utils";

type SearchParams = { type?: string; painted?: string };

/** One colour's line for a base part: what is on the shelf, promised, in transit. */
type ColourCell = {
  colorId: string;
  colourName: string;
  colourHex: string | null;
  variantId: string | null;
  onHand: number;
  promised: number;
  atPainter: number;
};

type Group = {
  baseId: string;
  sku: string;
  name: string;
  typeId: string;
  typeName: string;
  raw: number;
  painted: number;
  atPainter: number;
  colours: ColourCell[];
};

export const dynamic = "force-dynamic";

/**
 * The shelf question (docs/plan-painted-parts.md): for every paintable part,
 * raw on hand beside painted per colour — and, since phase 3, how much of the
 * painted stock is already promised to unbuilt bikes on open MOs and how much is
 * still at the painter. Painted stock is the stock of the part's painted
 * variants (real parts, real movements); promised and at-painter come from the
 * same requirement rule the floor queue uses and from sent paint-order lines.
 */
export default async function PaintedStockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const [t, tParts, tc, locale] = await Promise.all([
    getTranslations("paintedStock"),
    getTranslations("parts"),
    getTranslations("common"),
    getLocale(),
  ]);
  const supabase = await createClient();
  const typeFilter = sp.type && sp.type !== "all" ? sp.type : null;
  const onlyPainted = sp.painted === "1";

  const [partsRes, typesRes, coloursRes, lookup] = await Promise.all([
    supabase
      .from("parts")
      .select(
        `id, internal_sku, name_en, base_part_id, color_id, service_part_type_id,
         paintable_as:service_part_types!service_part_type_id(id, name_en, name_da)`,
      )
      .not("service_part_type_id", "is", null)
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
    supabase
      .from("service_part_types")
      .select("id, name_en, name_da")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("colors").select("id, name_en, name_da, hex"),
    loadPaintedStockLookup(supabase),
  ]);
  if (partsRes.error) {
    throw new Error(`Failed to load paintable parts: ${partsRes.error.message}`);
  }
  const all = partsRes.data ?? [];
  const demand = await loadPaintedDemand(supabase, lookup);
  const colourById = new Map(
    (coloursRes.data ?? []).map((c) => [
      c.id,
      { name: localizedName(locale, c.name_en, c.name_da), hex: c.hex },
    ]),
  );

  const groups = new Map<string, Group>();
  for (const p of all) {
    if (p.base_part_id) continue;
    const type = one(p.paintable_as);
    groups.set(p.id, {
      baseId: p.id,
      sku: p.internal_sku,
      name: p.name_en,
      typeId: p.service_part_type_id ?? "",
      typeName: type ? localizedName(locale, type.name_en, type.name_da) : "—",
      raw: lookup.onHand.get(p.id) ?? 0,
      painted: 0,
      atPainter: 0,
      colours: [],
    });
  }
  const cellFor = (g: Group, colorId: string): ColourCell => {
    let cell = g.colours.find((c) => c.colorId === colorId);
    if (!cell) {
      const colour = colourById.get(colorId);
      cell = {
        colorId,
        colourName: colour?.name ?? "—",
        colourHex: colour?.hex ?? null,
        variantId: null,
        onHand: 0,
        promised: 0,
        atPainter: 0,
      };
      g.colours.push(cell);
    }
    return cell;
  };
  // Variants: painted on hand per colour.
  for (const v of all) {
    if (!v.base_part_id || !v.color_id) continue;
    const g = groups.get(v.base_part_id);
    if (!g) continue;
    const cell = cellFor(g, v.color_id);
    cell.variantId = v.id;
    cell.onHand += lookup.onHand.get(v.id) ?? 0;
    g.painted += lookup.onHand.get(v.id) ?? 0;
  }
  // Promised (unbuilt bikes on open MOs) and in transit (sent order lines) —
  // both keyed by base part and colour, so a colour with demand but no variant
  // yet still gets a line ("2 white bikes need frames painted white").
  for (const [key, qty] of demand.promised) {
    const [baseId, colorId] = key.split(":");
    const g = groups.get(baseId);
    if (!g) continue;
    cellFor(g, colorId).promised += qty;
  }
  for (const [key, qty] of demand.atPainter) {
    const [baseId, colorId] = key.split(":");
    const g = groups.get(baseId);
    if (!g) continue;
    cellFor(g, colorId).atPainter += qty;
    g.atPainter += qty;
  }

  const rows = [...groups.values()]
    .filter((g) => !typeFilter || g.typeId === typeFilter)
    .filter((g) => !onlyPainted || g.painted > 0)
    .sort((a, b) => a.typeName.localeCompare(b.typeName) || a.name.localeCompare(b.name));
  for (const g of rows) {
    g.colours.sort((a, b) => b.onHand - a.onHand || b.promised - a.promised);
  }
  const totalRaw = rows.reduce((s, g) => s + g.raw, 0);
  const totalPainted = rows.reduce((s, g) => s + g.painted, 0);
  const totalAtPainter = rows.reduce((s, g) => s + g.atPainter, 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{tc("crumbDashboard")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/parts">{tParts("title")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("title")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="painted-type">
            {t("filterType")}
          </label>
          <select
            id="painted-type"
            name="type"
            defaultValue={typeFilter ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              typeFilter && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">{t("allTypes")}</option>
            {(typesRes.data ?? []).map((pt) => (
              <option key={pt.id} value={pt.id}>
                {localizedName(locale, pt.name_en, pt.name_da)}
              </option>
            ))}
          </select>
        </div>
        <label
          className={cn(
            "flex h-9 cursor-pointer items-center gap-2 text-sm",
            onlyPainted && "font-medium",
          )}
        >
          <input
            type="checkbox"
            name="painted"
            value="1"
            defaultChecked={onlyPainted}
            className="size-4"
          />
          {t("onlyPainted")}
        </label>
        <Button type="submit" size="sm" variant="outline">
          {tc("apply")}
        </Button>
      </form>

      <Panel
        title={t("title")}
        description={
          rows.length > 0
            ? t("totals", {
                raw: formatQuantity(totalRaw),
                painted: formatQuantity(totalPainted),
                atPainter: formatQuantity(totalAtPainter),
                parts: rows.length,
              })
            : undefined
        }
      >
        {groups.size === 0 ? (
          <EmptyState
            inPanel
            icon={Paintbrush}
            title={t("emptyTitle")}
            description={t("emptyDesc")}
          />
        ) : rows.length === 0 ? (
          <div className="text-ink-3 bg-ground flex h-20 items-center justify-center rounded-lg text-sm">
            {t("noMatch")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thPart")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("thType")}</TableHead>
                <TableHead className="text-right">{t("thRaw")}</TableHead>
                <TableHead className="text-right">{t("thAtPainter")}</TableHead>
                <TableHead className="text-right">{t("thPainted")}</TableHead>
                <TableHead>{t("thByColour")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((g) => (
                <TableRow key={g.baseId} className="hover:bg-muted/50">
                  <TableCell className="p-0 align-top">
                    <Link
                      href={`/parts/${g.baseId}`}
                      className="flex flex-col px-4 py-2.5 hover:underline"
                    >
                      <span>{g.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">{g.sku}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                    {g.typeName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(g.raw)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {g.atPainter > 0 ? (
                      <span className="text-money">{formatQuantity(g.atPainter)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatQuantity(g.painted)}
                  </TableCell>
                  <TableCell>
                    {g.colours.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {g.colours.map((c) => {
                          const free = c.onHand - c.promised;
                          const inner = (
                            <>
                              <ColorChip hex={c.colourHex} label={c.colourName} />
                              <span className="tabular-nums">× {formatQuantity(c.onHand)}</span>
                              {c.promised > 0 ? (
                                <span
                                  className={cn(
                                    "tabular-nums",
                                    free < 0 ? "text-alert" : "text-ink-2",
                                  )}
                                >
                                  {free < 0
                                    ? t("overPromised", { count: formatQuantity(-free) })
                                    : t("promisedFree", {
                                        promised: formatQuantity(c.promised),
                                        free: formatQuantity(free),
                                      })}
                                </span>
                              ) : null}
                              {c.atPainter > 0 ? (
                                <span className="text-money tabular-nums">
                                  {t("atPainterCount", { count: formatQuantity(c.atPainter) })}
                                </span>
                              ) : null}
                            </>
                          );
                          const cls =
                            "bg-surface inline-flex flex-wrap items-center gap-1.5 rounded-full border border-rule px-2 py-0.5 text-xs";
                          return (
                            <li key={c.colorId}>
                              {c.variantId ? (
                                <Link href={`/parts/${c.variantId}`} className={cn(cls, "hover:underline")}>
                                  {inner}
                                </Link>
                              ) : (
                                <span className={cls}>{inner}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
