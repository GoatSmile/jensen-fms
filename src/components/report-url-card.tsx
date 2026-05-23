import Link from "next/link";
import { ExternalLink, MessageCircleWarning } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { appOrigin } from "@/lib/qr";
import { createServiceClient } from "@/lib/supabase/service";
import { reportPageViewCount } from "@/lib/report/track-view";

const STATS_WINDOW_DAYS = 30;

/**
 * Widget showing the public customer report URL + recent usage stats.
 * Rendered on /admin/settings so the URL is easy to find for anyone in
 * the company.
 */
export async function ReportUrlCard() {
  const reportUrl = `${appOrigin()}/report`;
  const helpUrl = `${appOrigin()}/report/help`;

  // 30-day stats. Views are aggregate counts in report_page_views; the
  // submission count is just maintenance_tickets rows with
  // source='app' (both per-bike sticker reports and "I don't know my
  // bike" general reports use the same source enum).
  const supabase = createServiceClient();
  const sinceIso = new Date(
    Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [views, helpViews, ticketsRes] = await Promise.all([
    reportPageViewCount(["/report"], STATS_WINDOW_DAYS),
    reportPageViewCount(["/report/help"], STATS_WINDOW_DAYS),
    supabase
      .from("maintenance_tickets")
      .select("id", { count: "exact", head: true })
      .eq("source", "app")
      .gte("created_at", sinceIso),
  ]);
  const ticketsCount = ticketsRes.count ?? 0;

  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5">
      <header className="flex flex-col gap-1 pb-3">
        <div className="flex items-center gap-2">
          <MessageCircleWarning
            className="text-muted-foreground size-4"
            aria-hidden
          />
          <h2 className="text-sm font-semibold">Customer report URL</h2>
        </div>
        <p className="text-muted-foreground text-xs">
          Share this URL with customers who need to report a bike issue.
          They&rsquo;ll scan the QR sticker or enter the frame number; no
          login required.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border p-2">
          <code className="flex-1 font-mono text-sm break-all">{reportUrl}</code>
          <div className="flex gap-1.5">
            <CopyButton value={reportUrl} />
            <Link
              href="/report"
              target="_blank"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs"
            >
              <ExternalLink className="size-3.5" aria-hidden /> Open
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat
            label="Visits"
            value={views}
            hint={`/report · last ${STATS_WINDOW_DAYS} days`}
          />
          <Stat
            label="Send-a-message visits"
            value={helpViews}
            hint={`/report/help · last ${STATS_WINDOW_DAYS} days`}
          />
          <Stat
            label="Reports submitted"
            value={ticketsCount}
            hint={`From customer · last ${STATS_WINDOW_DAYS} days`}
          />
        </div>

        <div className="text-muted-foreground border-t pt-3 text-xs">
          <p>
            The &quot;I don&rsquo;t know my bike&quot; fallback lives at{" "}
            <code className="font-mono">{helpUrl}</code> — useful when a
            customer can&rsquo;t find the QR sticker. Both paths land in{" "}
            <Link
              href="/maintenance/tickets"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              /maintenance/tickets
            </Link>
            ; unidentified-bike reports show up flagged &ldquo;Needs
            triage&rdquo; in the Bike column.
          </p>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="bg-muted/30 flex flex-col gap-1 rounded-md border p-2.5">
      <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-[10px]">{hint}</span>
    </div>
  );
}
