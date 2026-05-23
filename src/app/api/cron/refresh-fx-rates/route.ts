import { NextResponse } from "next/server";

import { refreshLatestRates } from "@/app/admin/fx-rates/_actions/manage-fx";

export const dynamic = "force-dynamic";

/**
 * Daily FX rate refresh, called by Vercel Cron (configured in vercel.json).
 * Schedule: 17:00 UTC weekdays — after the ECB publishes its daily fix.
 *
 * Authorization: Vercel sets `Authorization: Bearer ${CRON_SECRET}` when
 * invoking cron routes if the env var is configured.
 *
 * Fail-closed on Vercel (any non-dev deployment) — if the env var is
 * missing the route returns 503 so a misconfigured deploy can't silently
 * leave it open to the internet. Locally the route stays callable
 * without a secret so you can curl it during development.
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
    // Local dev — allow through.
  } else {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  const result = await refreshLatestRates();
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
