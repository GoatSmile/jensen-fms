import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Metric } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
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
  const t = await getTranslations("adminSettings");
  const reportUrl = `${appOrigin()}/report`;
  const helpUrl = `${appOrigin()}/report/help`;

  // 30-day stats. Views are aggregate counts in report_page_views; the
  // submission count is just maintenance_tickets rows with
  // source='app' (both per-bike sticker reports and "I don't know my
  // bike" general reports use the same source enum).
  const supabase = createServiceClient();
  const sinceIso = new Date(
    // eslint-disable-next-line react-hooks/purity -- async server component: this runs once per request, not in a React render, so Date.now() is correct here.
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
    <Panel
      title={t("reportUrlTitle")}
      description={t("reportUrlDesc")}
      hue="good"
      contentClassName="pt-1"
    >
      <div className="flex flex-col gap-3">
        {/* Inner surfaces sit on bg-surface, per the tinting rule — the wash
            belongs to the panel, not to everything inside it. */}
        <div className="bg-surface flex flex-wrap items-center gap-2 rounded-md p-2">
          <code className="flex-1 font-mono text-sm break-all">{reportUrl}</code>
          <div className="flex gap-1.5">
            <CopyButton
              value={reportUrl}
              label={t("reportUrlCopy")}
              copiedLabel={t("reportUrlCopied")}
            />
            <Link
              href="/report"
              target="_blank"
              className="text-ink-2 hover:text-ink bg-surface inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs"
            >
              <ExternalLink className="size-3.5" aria-hidden />{" "}
              {t("reportUrlOpen")}
            </Link>
          </div>
        </div>

        {/* The audit's other boxed metric row. Same treatment as part
            detail's: flat washes, no borders. `good` throughout — these are
            all "the public report page is working" counts, one subject. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Metric
            hue="good"
            label={t("reportUrlVisits")}
            value={views}
            hint={t("reportUrlVisitsHint", { days: STATS_WINDOW_DAYS })}
          />
          <Metric
            hue="good"
            label={t("reportUrlMsgVisits")}
            value={helpViews}
            hint={t("reportUrlMsgVisitsHint", { days: STATS_WINDOW_DAYS })}
          />
          <Metric
            hue="good"
            label={t("reportUrlSubmitted")}
            value={ticketsCount}
            hint={t("reportUrlSubmittedHint", { days: STATS_WINDOW_DAYS })}
          />
        </div>

        <div className="text-ink-2 border-rule border-t pt-3 text-xs">
          <p>
            {t.rich("reportUrlFallback", {
              helpUrl,
              code: (chunks) => <code className="font-mono">{chunks}</code>,
              link: (chunks) => (
                <Link
                  href="/maintenance/tickets"
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </div>
    </Panel>
  );
}

