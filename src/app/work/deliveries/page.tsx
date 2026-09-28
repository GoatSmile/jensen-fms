import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ChevronRight, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * *Leveringer* — the orders ready to hand over (Dennis, 15 Sep 02:22: "he just
 * opens the app and presses on delivery notes"). One card per sales order in
 * `ready`, soonest requested delivery first; tapping opens the delivery note,
 * where the recipient signs. A signed order is delivered and drops off.
 */
export default async function DeliveriesPage() {
  const t = await getTranslations("deliveries");
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, requested_delivery_date,
       delivery_contact_name, delivery_contact_phone, delivery_address,
       organization:organizations!organization_id(legal_name, display_name_da, display_name_en),
       organization_unit:organization_units!organization_unit_id(name)`,
    )
    .eq("status", "ready")
    .order("requested_delivery_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Failed to load deliveries: ${error.message}`);

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

      {(orders ?? []).length === 0 ? (
        <Panel contentClassName="flex flex-col items-center gap-2 py-8 text-center">
          <Truck className="text-muted-foreground size-6" aria-hidden />
          <p className="text-sm font-medium">{t("emptyTitle")}</p>
          <p className="text-muted-foreground text-xs">{t("emptyBody")}</p>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {(orders ?? []).map((o) => {
            const org = Array.isArray(o.organization)
              ? o.organization[0]
              : o.organization;
            const unit = Array.isArray(o.organization_unit)
              ? o.organization_unit[0]
              : o.organization_unit;
            const customer =
              org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? "—";
            return (
              <li key={o.id}>
                <Link
                  href={`/work/deliveries/${o.id}`}
                  className="group bg-card flex items-center justify-between gap-3 rounded-lg border p-4 shadow-sm transition-colors hover:bg-muted/30"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <SegmentedId
                      value={o.sales_order_number}
                      className="text-muted-foreground text-xs"
                    />
                    <span className="font-semibold">
                      {customer}
                      {unit?.name ? ` · ${unit.name}` : ""}
                    </span>
                    {o.delivery_contact_name || o.delivery_contact_phone ? (
                      <span className="text-muted-foreground text-sm">
                        {[o.delivery_contact_name, o.delivery_contact_phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                    {o.delivery_address ? (
                      <span className="text-muted-foreground text-xs">
                        {o.delivery_address}
                      </span>
                    ) : null}
                    {o.requested_delivery_date ? (
                      <span className="text-money text-xs">
                        {t("requested", { date: o.requested_delivery_date })}
                      </span>
                    ) : null}
                  </div>
                  <ChevronRight
                    className="text-muted-foreground/60 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
