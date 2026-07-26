import Link from "next/link";
import { getTranslations } from "next-intl/server";

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
import { formatDkk, formatQuantity } from "@/lib/parts/stock";
import { round2 } from "@/lib/invoicing/status";

export const dynamic = "force-dynamic";

/**
 * Stock-valuation report (Tier 4). Value of parts on hand at weighted-average
 * purchase cost (Σ received_qty × unit_cost ÷ Σ received_qty from inventory
 * movements), MINUS stock a customer has already paid for via an issued
 * part-based deposit ("the 200 paid frames shouldn't count"). The paid
 * quantities come straight from the deposit invoices' part lines — no separate
 * flag. Weighted-average is the agreed policy (revisor to confirm; FIFO is the
 * alternative).
 */
export default async function StockValuePage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("parts"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  // On-hand per part, summed across locations.
  const { data: stock } = await supabase
    .from("v_current_stock")
    .select("part_id, quantity_on_hand");
  const onHandByPart = new Map<string, number>();
  for (const r of stock ?? []) {
    if (!r.part_id) continue;
    onHandByPart.set(
      r.part_id,
      (onHandByPart.get(r.part_id) ?? 0) + Number(r.quantity_on_hand ?? 0),
    );
  }
  const partIds = [...onHandByPart.entries()]
    .filter(([, q]) => q > 0)
    .map(([id]) => id);

  // Weighted-average purchase cost from receipt movements (positive deltas with
  // a recorded landed unit cost).
  const costAcc = new Map<string, { qty: number, cost: number }>();
  // Prepaid quantities from issued part-based deposits.
  const prepaidByPart = new Map<string, number>();
  const partInfo = new Map<string, { sku: string; name: string }>();

  if (partIds.length > 0) {
    const [movesRes, depRes, partsRes] = await Promise.all([
      supabase
        .from("inventory_movements")
        .select("part_id, quantity_delta, unit_cost_dkk")
        .gt("quantity_delta", 0)
        .not("unit_cost_dkk", "is", null)
        .in("part_id", partIds),
      supabase
        .from("invoices")
        .select("id")
        .eq("kind", "deposit")
        .not("status", "in", "(draft,cancelled,credited)")
        .is("credited_invoice_id", null),
      supabase
        .from("parts")
        .select("id, internal_sku, name_en")
        .in("id", partIds),
    ]);

    for (const m of movesRes.data ?? []) {
      if (!m.part_id) continue;
      const qty = Number(m.quantity_delta ?? 0);
      const cost = Number(m.unit_cost_dkk ?? 0);
      const acc = costAcc.get(m.part_id) ?? { qty: 0, cost: 0 };
      acc.qty += qty;
      acc.cost += qty * cost;
      costAcc.set(m.part_id, acc);
    }

    const depIds = (depRes.data ?? []).map((d) => d.id);
    if (depIds.length > 0) {
      const { data: depLines } = await supabase
        .from("invoice_lines")
        .select("part_id, quantity")
        .in("invoice_id", depIds)
        .not("part_id", "is", null);
      for (const l of depLines ?? []) {
        if (!l.part_id) continue;
        prepaidByPart.set(
          l.part_id,
          (prepaidByPart.get(l.part_id) ?? 0) + Number(l.quantity ?? 0),
        );
      }
    }

    for (const p of partsRes.data ?? []) {
      partInfo.set(p.id, { sku: p.internal_sku, name: p.name_en });
    }
  }

  const rows = partIds
    .map((id) => {
      const onHand = onHandByPart.get(id) ?? 0;
      const acc = costAcc.get(id);
      const avgCost = acc && acc.qty > 0 ? round2(acc.cost / acc.qty) : 0;
      const prepaidQty = Math.min(onHand, prepaidByPart.get(id) ?? 0);
      const countableQty = Math.max(0, onHand - prepaidQty);
      const info = partInfo.get(id);
      return {
        id,
        sku: info?.sku ?? "—",
        name: info?.name ?? "—",
        onHand,
        avgCost,
        prepaidQty,
        value: round2(countableQty * avgCost),
        priced: avgCost > 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  const netTotal = round2(rows.reduce((s, r) => s + r.value, 0));
  const grossTotal = round2(
    rows.reduce((s, r) => s + r.onHand * r.avgCost, 0),
  );
  const prepaidExcluded = round2(grossTotal - netTotal);
  const unpriced = rows.filter((r) => !r.priced).length;
  const prepaidParts = rows.filter((r) => r.prepaidQty > 0).length;

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
              <Link href="/parts">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("svTitle")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("svTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("svDescription")}</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Stat label={t("svStatValue")} big>
          {formatDkk(netTotal)}
        </Stat>
        <Stat label={t("svGross")}>{formatDkk(grossTotal)}</Stat>
        <Stat label={t("svCustomerPaid")}>
          {prepaidExcluded > 0 ? `− ${formatDkk(prepaidExcluded)}` : formatDkk(0)}
        </Stat>
        <Stat label={t("svPartsInStock")}>{rows.length}</Stat>
      </dl>

      {(unpriced > 0 || prepaidParts > 0) && (
        <p className="text-muted-foreground text-xs">
          {prepaidParts > 0 ? t("svPrepaidNote", { count: prepaidParts }) : ""}
          {unpriced > 0 ? t("svUnpricedNote", { count: unpriced }) : ""}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-sm italic">
          {t("svNothing")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("svThPart")}</TableHead>
                <TableHead className="text-right">{t("svThOnHand")}</TableHead>
                <TableHead className="text-right">
                  {t("svThCustomerPaid")}
                </TableHead>
                <TableHead className="text-right">{t("svThAvgCost")}</TableHead>
                <TableHead className="text-right">{t("svThValue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/50">
                  <TableCell className="p-0">
                    <Link
                      href={`/parts/${r.id}`}
                      className="flex flex-col px-4 py-2 hover:underline"
                    >
                      <span className="text-sm">{r.name}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {r.sku}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(r.onHand)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.prepaidQty > 0 ? (
                      <span className="text-money">
                        {formatQuantity(r.prepaidQty)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.priced ? (
                      formatDkk(r.avgCost)
                    ) : (
                      <span className="text-muted-foreground">
                        {t("svNoCost")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatDkk(r.value)}
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

function Stat({
  label,
  children,
  big,
}: {
  label: string;
  children: React.ReactNode;
  big?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className={`tabular-nums ${big ? "text-xl font-semibold" : "text-sm"}`}>
        {children}
      </dd>
    </div>
  );
}
