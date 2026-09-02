import { NextResponse } from "next/server";

import {
  overdueInvoicesEmail,
  type OverdueInvoiceRow,
} from "@/lib/people/email-content";
import { notifyDigest } from "@/lib/people/notify";
import { appOrigin } from "@/lib/qr";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * invoice.overdue (people & roles P4) — the state-scan event: a daily
 * digest of invoices that crossed their due date, to the roles subscribed
 * in role_notifications (seeds: owner + accountant). Idempotent via
 * outbound_messages — an invoice is digested ONCE when first seen overdue,
 * not re-nagged daily (the dashboard money band is the standing reminder).
 *
 * Auth mirrors the other crons: Vercel sends `Authorization: Bearer
 * ${CRON_SECRET}`; fail-closed on Vercel if unset, open locally.
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
  } else if (
    request.headers.get("authorization") !== `Bearer ${expected}`
  ) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  // Same overdue definition as the dashboard money band: issued/overdue,
  // not a credit note, past due_date.
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      `
        id, invoice_number, total_amount, currency, due_date,
        organization:organizations!organization_id(
          legal_name, display_name_da, display_name_en
        )
      `,
    )
    .in("status", ["issued", "overdue"])
    .is("credited_invoice_id", null)
    .not("due_date", "is", null)
    .lt("due_date", today)
    .order("due_date", { ascending: true });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const all = invoices ?? [];
  if (all.length === 0) {
    return NextResponse.json({ ok: true, overdue: 0, newlyNotified: 0 });
  }

  // Drop invoices any recipient was already told about (one query).
  // A digest is ONE message covering N invoices, so the ids live in an array
  // on the row and the filter is an overlap. Only `sent` counts: a refused
  // digest should go out tomorrow rather than be marked as delivered.
  const { data: logged } = await supabase
    .from("outbound_messages")
    .select("entity_ids")
    .eq("kind", "notification")
    .eq("event_key", "invoice.overdue")
    .eq("status", "sent")
    .overlaps(
      "entity_ids",
      all.map((i) => i.id),
    );
  const alreadyNotified = new Set(
    (logged ?? []).flatMap((l) => l.entity_ids ?? []),
  );
  const fresh = all.filter((i) => !alreadyNotified.has(i.id));
  if (fresh.length === 0) {
    return NextResponse.json({
      ok: true,
      overdue: all.length,
      newlyNotified: 0,
    });
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const rows: OverdueInvoiceRow[] = fresh.map((inv) => ({
    invoiceNumber: inv.invoice_number,
    orgName:
      inv.organization?.display_name_da ??
      inv.organization?.display_name_en ??
      inv.organization?.legal_name ??
      null,
    amount: Number(inv.total_amount),
    currency: inv.currency,
    daysLate: Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(`${inv.due_date}T00:00:00Z`).getTime()) /
          msPerDay,
      ),
    ),
  }));

  const result = await notifyDigest(supabase, {
    eventKey: "invoice.overdue",
    entityIds: fresh.map((i) => i.id),
    buildContent: (lang) =>
      overdueInvoicesEmail(lang, { rows, url: `${appOrigin()}/invoices` }),
  });

  return NextResponse.json({
    ok: true,
    overdue: all.length,
    newlyNotified: fresh.length,
    emails: result,
  });
}
