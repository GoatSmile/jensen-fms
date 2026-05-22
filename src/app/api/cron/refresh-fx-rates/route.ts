import { NextResponse } from "next/server";

import { refreshLatestRates } from "@/app/admin/fx-rates/_actions/manage-fx";

export const dynamic = "force-dynamic";

/**
 * Daily FX rate refresh, called by Vercel Cron (configured in vercel.json).
 * Schedule: 17:00 UTC weekdays — after the ECB publishes its daily fix.
 *
 * Authorization: Vercel sets `Authorization: Bearer ${CRON_SECRET}` when
 * invoking cron routes if the env var is configured. In dev / when the
 * secret isn't set the route is open — fine while the app is public-
 * access anyway, but tighten when M1 lands.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await refreshLatestRates();
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
