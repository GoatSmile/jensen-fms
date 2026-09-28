import "server-only";

import { refreshLatestRates } from "@/app/admin/fx-rates/_actions/manage-fx";
import { DICTATION_PREFIX } from "@/lib/dictation/storage";
import { loadInboundSettings } from "@/lib/inbound/settings";
import {
  overdueInvoicesEmail,
  type OverdueInvoiceRow,
} from "@/lib/people/email-content";
import { notifyDigest } from "@/lib/people/notify";
import { appOrigin } from "@/lib/qr";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/types/database";

/**
 * Every scheduled job's WORK, keyed by the last segment of its route
 * (`/api/cron/<key>`). The routes only authenticate and hand over to
 * `runJob`, and *Run now* on /admin/jobs calls the same function — so a
 * manual run is exactly a scheduled one, recorded the same way.
 *
 * vercel.json stays the list of what is SCHEDULED; this map is what the code
 * can RUN. /admin/jobs shows both, and flags a job in one but not the other.
 */
export type JobOutcome = { ok: boolean; summary: string; detail?: Json };

type Service = ReturnType<typeof createServiceClient>;

export const JOBS: Record<string, (supabase: Service) => Promise<JobOutcome>> = {
  /** ECB rates for every tracked currency → fx_rates. */
  "refresh-fx-rates": async () => {
    const r = await refreshLatestRates();
    return r.ok
      ? { ok: true, summary: r.message }
      : { ok: false, summary: r.error };
  },

  /**
   * GDPR retention: voicemail audio older than the retention window goes, the
   * transcript stays; stray dictation audio older than 24 h goes too.
   */
  "inbound-retention": async (supabase) => {
    const BUCKET = "inbound";
    const { mediaRetentionDays } = await loadInboundSettings(supabase);
    const cutoff = new Date(Date.now() - mediaRetentionDays * 86_400_000).toISOString();
    const { data: stale, error } = await supabase
      .from("inbound_messages")
      .select("id, media_path")
      .not("media_path", "is", null)
      .lt("received_at", cutoff);
    if (error) return { ok: false, summary: error.message };
    let removed = 0;
    for (const row of stale ?? []) {
      if (row.media_path) await supabase.storage.from(BUCKET).remove([row.media_path]);
      await supabase
        .from("inbound_messages")
        .update({ media_path: null, media_mime_type: null })
        .eq("id", row.id);
      removed += 1;
    }
    // A dictation's audio is deleted as soon as its text comes back, so
    // anything still here after 24 h is the crash case nobody returns for.
    let strayDictations = 0;
    const { data: files } = await supabase.storage
      .from(BUCKET)
      .list(DICTATION_PREFIX, { limit: 1000 });
    const threshold = Date.now() - 24 * 60 * 60 * 1000;
    const strays = (files ?? [])
      .filter((o) => {
        const at = Date.parse(o.created_at ?? "");
        return Number.isFinite(at) && at < threshold;
      })
      .map((o) => `${DICTATION_PREFIX}/${o.name}`);
    if (strays.length > 0) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(strays);
      if (!rmErr) strayDictations = strays.length;
    }
    return {
      ok: true,
      summary: `${removed} recording(s) past ${mediaRetentionDays} days removed; ${strayDictations} stray dictation(s).`,
      detail: { removed, strayDictations, cutoff, retentionDays: mediaRetentionDays },
    };
  },

  /**
   * invoice.overdue: one digest of invoices that crossed their due date, to
   * the subscribed roles. Idempotent through outbound_messages — an invoice is
   * digested ONCE, and only a `sent` digest counts, so a refused one retries.
   */
  "notify-overdue-invoices": async (supabase) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select(
        `id, invoice_number, total_amount, currency, due_date,
         organization:organizations!organization_id(legal_name, display_name_da, display_name_en)`,
      )
      .in("status", ["issued", "overdue"])
      .is("credited_invoice_id", null)
      .not("due_date", "is", null)
      .lt("due_date", today)
      .order("due_date", { ascending: true });
    if (error) return { ok: false, summary: error.message };
    const all = invoices ?? [];
    if (all.length === 0) return { ok: true, summary: "No overdue invoices." };

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
    const already = new Set((logged ?? []).flatMap((l) => l.entity_ids ?? []));
    const fresh = all.filter((i) => !already.has(i.id));
    if (fresh.length === 0) {
      return { ok: true, summary: `${all.length} overdue, all already notified.` };
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
          (Date.now() - new Date(`${inv.due_date}T00:00:00Z`).getTime()) / msPerDay,
        ),
      ),
    }));
    const result = await notifyDigest(supabase, {
      eventKey: "invoice.overdue",
      entityIds: fresh.map((i) => i.id),
      buildContent: (lang) =>
        overdueInvoicesEmail(lang, { rows, url: `${appOrigin()}/invoices` }),
    });
    return {
      ok: true,
      summary: `${all.length} overdue; ${fresh.length} newly notified (${result.sent} email(s) sent).`,
      detail: { overdue: all.length, newlyNotified: fresh.length, emails: result },
    };
  },

  /**
   * Paint orders leave on their drop-off date (migration 106): every
   * CONFIRMED order whose date has come moves to at_supplier. Guarded on the
   * status, so running twice moves nothing twice.
   */
  "paint-drop-offs": async (supabase) => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Copenhagen",
    }).format(new Date());
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("service_orders")
      .update({ status: "at_supplier", dropped_off_at: nowIso, updated_at: nowIso })
      .eq("status", "confirmed")
      .not("planned_send_date", "is", null)
      .lte("planned_send_date", today)
      .select("order_number");
    if (error) return { ok: false, summary: error.message };
    const moved = (data ?? []).map((r) => r.order_number);
    return {
      ok: true,
      summary: moved.length ? `Moved to at painter: ${moved.join(", ")}.` : "Nothing due today.",
      detail: { today, moved },
    };
  },
};
