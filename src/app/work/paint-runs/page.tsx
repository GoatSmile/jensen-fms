import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, PaintBucket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { localizedName } from "@/i18n/vocab";
import { createClient } from "@/lib/supabase/server";

import { PaintRunCard, type PaintRun } from "./_components/paint-run-card";

export const dynamic = "force-dynamic";

/**
 * *Lakture* — Finn's paint runs (owner, 2026-09-28). Two lists:
 *   - **To drop off**: `confirmed` orders, soonest drop-off first.
 *   - **At the painter**: `at_supplier` / `ready`, ready first.
 * What is in the boxes (part × colour × quantity) and where it goes — never a
 * price: the Workshop role sees no money, which is why this is not the
 * paint-order page with a capability added.
 */
export default async function PaintRunsPage() {
  const [t, locale] = await Promise.all([getTranslations("paintRuns"), getLocale()]);
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("service_orders")
    .select(
      `id, order_number, status, planned_send_date, pickup_date, dropped_off_at,
       supplier:suppliers!supplier_id(name, address_line1, address_line2, zip_code, phone),
       sales_order:sales_orders!sales_order_id(sales_order_number),
       items:service_order_items(
         quantity,
         part_type:service_part_types!service_part_type_id(name_en, name_da),
         part:parts!part_id(name_en),
         color:colors!color_id(name_en, name_da)
       ),
       bikes:service_order_bikes(bike_id)`,
    )
    .in("status", ["confirmed", "at_supplier", "ready"])
    .order("planned_send_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Failed to load paint runs: ${error.message}`);

  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;

  const runs: PaintRun[] = (orders ?? []).map((o) => {
    const s = one(o.supplier);
    return {
      id: o.id,
      orderNumber: o.order_number,
      status: o.status as PaintRun["status"],
      dropOff: o.planned_send_date,
      pickup: o.pickup_date,
      supplier: s?.name ?? "—",
      supplierAddress:
        [s?.address_line1, s?.address_line2, s?.zip_code]
          .filter((x) => x && String(x).trim())
          .join(", ") || null,
      supplierPhone: s?.phone ?? null,
      salesOrder: one(o.sales_order)?.sales_order_number ?? null,
      bikeCount: (o.bikes ?? []).length,
      lines: (o.items ?? []).map((i) => {
        const pt = one(i.part_type);
        const c = one(i.color);
        return {
          what:
            one(i.part)?.name_en ??
            (pt ? localizedName(locale, pt.name_en, pt.name_da) : "—"),
          colour: c ? localizedName(locale, c.name_en, c.name_da) : null,
          quantity: Number(i.quantity),
        };
      }),
    };
  });

  const toDropOff = runs.filter((r) => r.status === "confirmed");
  const away = runs
    .filter((r) => r.status !== "confirmed")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "ready" ? -1 : 1));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/work">
            <ArrowLeft className="mr-1 size-4" aria-hidden /> {t("back")}
          </Link>
        </Button>
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      {runs.length === 0 ? (
        <Panel contentClassName="flex flex-col items-center gap-2 py-8 text-center">
          <PaintBucket className="text-muted-foreground size-6" aria-hidden />
          <p className="text-sm font-medium">{t("emptyTitle")}</p>
          <p className="text-muted-foreground text-xs">{t("emptyBody")}</p>
        </Panel>
      ) : null}

      {toDropOff.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
            {t("toDropOff")} ({toDropOff.length})
          </h2>
          {toDropOff.map((r) => (
            <PaintRunCard key={r.id} run={r} />
          ))}
        </section>
      ) : null}

      {away.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
            {t("atPainter")} ({away.length})
          </h2>
          {away.map((r) => (
            <PaintRunCard key={r.id} run={r} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
