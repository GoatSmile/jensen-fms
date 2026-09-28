import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paint orders leave on their drop-off date (migration 106, owner 2026-09-28).
 * Every morning, each CONFIRMED service order whose planned drop-off date has
 * come moves to `at_supplier` and stamps `dropped_off_at` — Dennis asked for
 * it to happen by itself on the day Finn drives. A drive that slips is
 * recorded by moving the date; an early one by moving the order by hand.
 *
 * Only `confirmed` moves: a `planned` order has not been sent to the painter,
 * so its date is a wish, not a booking. The update is guarded on the status,
 * so a hand-moved order is never touched twice.
 *
 * Auth mirrors the other crons: Vercel sends `Authorization: Bearer
 * ${CRON_SECRET}`; fail-closed on Vercel if the secret is unset, open locally.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const isVercel = Boolean(process.env.VERCEL);

  if (!expected) {
    if (isVercel) {
      return NextResponse.json(
        { ok: false, error: "CRON_SECRET not configured" },
        { status: 503 },
      );
    }
  } else if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // "Today" in the workshop's time zone, not the server's UTC.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
  }).format(new Date());

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("service_orders")
    .update({ status: "at_supplier", dropped_off_at: nowIso, updated_at: nowIso })
    .eq("status", "confirmed")
    .not("planned_send_date", "is", null)
    .lte("planned_send_date", today)
    .select("id, order_number");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    today,
    moved: (data ?? []).map((r) => r.order_number),
  });
}
