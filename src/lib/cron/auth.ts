import { NextResponse } from "next/server";

/**
 * The one check every cron route makes: Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`. FAIL-CLOSED on Vercel when the
 * secret is unset (503, never run unauthenticated); open locally so a job can
 * be curled during development. Null means "go ahead".
 */
export function refuseUnlessCron(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.VERCEL) {
      return NextResponse.json(
        { ok: false, error: "CRON_SECRET not configured" },
        { status: 503 },
      );
    }
    return null;
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}
