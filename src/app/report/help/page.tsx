import Link from "next/link";
import { ArrowLeft, MessageSquareText } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { trackReportPageView } from "@/lib/report/track-view";

import { GeneralReportForm } from "./_components/general-report-form";

export const dynamic = "force-dynamic";

/**
 * "I don't know which bike — please call me" path. Anonymous, same
 * posture as the rest of /report. Creates a maintenance_tickets row
 * with bike_id = NULL for staff to triage.
 */
export default function ReportHelpPage() {
  trackReportPageView("/report/help");
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col items-center gap-3 pt-2 text-center">
        <Logo heightClass="h-12" />
        <p className="text-muted-foreground text-xs">Kvalitetscykler</p>
      </header>

      <section className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/20 p-5 text-center">
        <MessageSquareText
          className="text-muted-foreground size-6"
          aria-hidden
        />
        <h1 className="text-xl font-semibold tracking-tight">
          Send us a message
        </h1>
        <p className="text-muted-foreground text-sm">
          Tell us what&rsquo;s wrong and we&rsquo;ll get back to you. Useful
          when you can&rsquo;t find or read the QR sticker on the bike.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
        <GeneralReportForm />
      </section>

      <div className="text-muted-foreground flex justify-center pt-2 text-xs">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/report">
            <ArrowLeft className="mr-1 size-3.5" aria-hidden />
            Back to scan/enter frame number
          </Link>
        </Button>
      </div>
    </div>
  );
}
