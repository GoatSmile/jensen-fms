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
import { colorFinishLabel } from "@/lib/colors/coating";
import { formatQuantity } from "@/lib/parts/stock";
import { FILTER_ACTIVE_CLASS } from "@/lib/filter-style";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import { cn } from "@/lib/utils";

type SearchParams = { type?: string; painted?: string };

type VariantCell = {
  partId: string;
  colourName: string;
  colourHex: string | null;
  colourFinish: string | null;
  onHand: number;
};

type Group = {
  baseId: string;
  sku: string;
  name: string;
  typeId: string;
  typeName: string;
  raw: number;
  painted: number;
  variants: VariantCell[];
};

export const dynamic = "force-dynamic";

/**
 * The shelf question (docs/plan-painted-parts.md): for every paintable part,
 * raw on hand beside painted on hand, per colour. Painted stock is the stock of
 * the part's painted variants — real parts with real movements — so this page
 * is a grouping of `v_current_stock`, not a new source of truth.
 */
export default async function PaintedStockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const [t, tc, tParts, locale] = await Promise.all([
    getTranslations("paintedStock"),
    getTranslations("common"),
    getTranslations("parts"),
    getLocale(),
  ]);
  const supabase = await createClient();
  const typeFilter = sp.type && sp.type !== "all" ? sp.type : null;
  const onlyPainted = sp.painted === "1";

  const [partsRes, typesRes] = await Promise.all([
    supabase
      .from("parts")
      .select(
        `id, internal_sku, name_en, base_part_id, service_part_type_id,
         color:colors!color_id(name_en, name_da, hex, ral_code, coating),
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
  ]);
  if (partsRes.error) {
    throw new Error(`Failed to load paintable parts: ${partsRes.error.message}`);
  }
  const all = partsRes.data ?? [];

  const onHand = new Map<string, number>();
  if (all.length > 0) {
    const { data: stock } = await supabase
      .from("v_current_stock")
      .select("part_id, quantity_on_hand")
      .in("part_id", all.map((p) => p.id));
    for (const r of stock ?? []) {
      if (!r.part_id) continue;
      onHand.set(r.part_id, (onHand.get(r.part_id) ?? 0) + Number(r.quantity_on_hand ?? 0));
    }
  }

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
      raw: onHand.get(p.id) ?? 0,
      painted: 0,
      variants: [],
    });
  }
  for (const v of all) {
    if (!v.base_part_id) continue;
    const g = groups.get(v.base_part_id);
    if (!g) continue;
    const colour = one(v.color);
    const qty = onHand.get(v.id) ?? 0;
    g.painted += qty;
    g.variants.push({
      partId: v.id,
      colourName: colour ? localizedName(locale, colour.name_en, colour.name_da) : "—",
      colourHex: colour?.hex ?? null,
      colourFinish: colour
        ? colorFinishLabel(colour.ral_code, colour.coating, locale === "da" ? "da" : "en")
        : null,
      onHand: qty,
    });
  }

  const rows = [...groups.values()]
    .filter((g) => !typeFilter || g.typeId === typeFilter)
    .filter((g) => !onlyPainted || g.painted > 0)
    .sort((a, b) => a.typeName.localeCompare(b.typeName) || a.name.localeCompare(b.name));
  for (const g of rows) g.variants.sort((a, b) => b.onHand - a.onHand);
  const totalRaw = rows.reduce((s, g) => s + g.raw, 0);
  const totalPainted = rows.reduce((s, g) => s + g.painted, 0);

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
                <TableHead className="text-right">{t("thPainted")}</TableHead>
                <TableHead>{t("thByColour")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((g) => (
                <TableRow key={g.baseId} className="hover:bg-muted/50">
                  <TableCell className="p-0">
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
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatQuantity(g.painted)}
                  </TableCell>
                  <TableCell>
                    {g.variants.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {g.variants.map((v) => (
                          <Link
                            key={v.partId}
                            href={`/parts/${v.partId}`}
                            className="bg-surface inline-flex items-center gap-1.5 rounded-full border border-rule px-2 py-0.5 text-xs hover:underline"
                            title={v.colourFinish ?? undefined}
                          >
                            <ColorChip hex={v.colourHex} label={v.colourName} />
                            <span className="tabular-nums">× {formatQuantity(v.onHand)}</span>
                          </Link>
                        ))}
                      </div>
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
