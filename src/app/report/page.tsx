import { Bike } from "lucide-react";

import { Logo } from "@/components/logo";
import { trackReportPageView } from "@/lib/report/track-view";

import { ReportEntry } from "./_components/report-entry";

export const dynamic = "force-dynamic";

/**
 * Public customer-facing entry point for reporting an issue with a bike.
 *
 * One URL the customer can share / be sent: the customer either types the
 * bike's frame number or scans the QR sticker. Both paths resolve to the
 * existing /b/<bike-id> page which carries the actual report form.
 *
 * No auth — same posture as /b/<id>. When M1 middleware lands, /report/*
 * stays on the public allow-list alongside /b/*.
 */
export default function ReportLandingPage() {
  trackReportPageView("/report");
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col items-center gap-3 pt-2 text-center">
        <Logo heightClass="h-12" />
        <p className="text-muted-foreground text-xs">Kvalitetscykler</p>
      </header>

      <section className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/20 p-5 text-center">
        <Bike className="text-muted-foreground size-6" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Report a problem with your bike
        </h1>
        <p className="text-muted-foreground text-sm">
          Find your bike first — type its frame number or scan the QR
          sticker.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
        <ReportEntry />
      </section>
    </div>
  );
}
