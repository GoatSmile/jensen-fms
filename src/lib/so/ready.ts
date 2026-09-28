import "server-only";

import { soReadyEmail } from "@/lib/people/email-content";
import { notifyEvent } from "@/lib/people/notify";
import { appOrigin } from "@/lib/qr";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * A sales order is READY when there is nothing left to build for it: every
 * bike line has its MO, and every MO is completed (or cancelled, with at
 * least one completed). Called when an MO closes; moves the SO to `ready`
 * from `confirmed` / `in_production` and tells Dennis (`so.ready`), who
 * decides whether the customer collects or Finn delivers (15 Sep, 02:07).
 *
 * Quiet by design: any other state, or a failure, leaves the SO where it is —
 * the office can always move it by hand, and a failed notice must not fail
 * completing the MO (the rule for every notification).
 */
export async function markSOReadyWhenBuilt(
  supabase: Supabase,
  soId: string,
): Promise<boolean> {
  const { data: so } = await supabase
    .from("sales_orders")
    .select(
      "id, sales_order_number, status, organization:organizations!organization_id(legal_name, display_name_da, display_name_en)",
    )
    .eq("id", soId)
    .maybeSingle();
  if (!so || (so.status !== "confirmed" && so.status !== "in_production")) {
    return false;
  }

  const [linesRes, mosRes] = await Promise.all([
    supabase
      .from("sales_order_lines")
      .select("id")
      .eq("sales_order_id", soId)
      .not("bike_template_id", "is", null),
    supabase
      .from("manufacturing_orders")
      .select("id, status, sales_order_line_id")
      .eq("sales_order_id", soId),
  ]);
  const mos = mosRes.data ?? [];
  if (mos.length === 0) return false;
  const lineIdsWithMO = new Set(mos.map((m) => m.sales_order_line_id));
  const unspawned = (linesRes.data ?? []).some((l) => !lineIdsWithMO.has(l.id));
  const open = mos.some(
    (m) => m.status !== "completed" && m.status !== "cancelled",
  );
  const anyBuilt = mos.some((m) => m.status === "completed");
  if (unspawned || open || !anyBuilt) return false;

  const { data: moved } = await supabase
    .from("sales_orders")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", soId)
    .eq("status", so.status)
    .select("id");
  if (!moved || moved.length === 0) return false;

  const { count: bikeCount } = await supabase
    .from("bikes")
    .select("id", { count: "exact", head: true })
    .in(
      "manufacturing_order_id",
      mos.filter((m) => m.status === "completed").map((m) => m.id),
    )
    .is("deleted_at", null);

  const org = Array.isArray(so.organization) ? so.organization[0] : so.organization;
  await notifyEvent(supabase, {
    eventKey: "so.ready",
    entityId: soId,
    buildContent: (lang) =>
      soReadyEmail(lang, {
        soNumber: so.sales_order_number,
        customer:
          org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? null,
        bikeCount: bikeCount ?? 0,
        url: `${appOrigin()}/sales-orders/${soId}`,
      }),
  });
  return true;
}
