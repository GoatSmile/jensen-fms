"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { pushInvoiceToEconomicAction } from "../_actions/push-economic";

/**
 * e-conomic's "spark" logo mark, traced from the inline SVG in
 * e-conomic.com's own stylesheet (Logo-inline-pos-rgb, mark group only).
 * Brand colour is #e89c2e on white; here it renders in currentColor so it
 * reads white on the orange button.
 */
function EconomicMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 81.5 81.5"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="m9.29 46.58c-4.21-.84-8.3 1.9-9.14 6.1-.84 4.21 1.9 8.3 6.1 9.14 4.21.84 8.3-1.9 9.14-6.1.84-4.21-1.9-8.3-6.1-9.14Z" />
      <path d="m55.01 55.68c-7.01-1.4-13.83 3.16-15.23 10.17-1.39 7.01 3.16 13.83 10.17 15.23 7.01 1.39 13.83-3.16 15.23-10.17 1.4-7.01-3.16-13.83-10.17-15.23Z" />
      <path d="m68.67.3c-8.42-1.68-16.6 3.78-18.29 12.2l-1.5 7.62c-1.11 5.62-6.58 9.27-12.2 8.16l-5.08-1.04c-5.59-1.11-9.25-6.55-8.13-12.17l.26-1.27c.96-4.9-2.23-9.69-7.12-10.65-4.92-.98-9.69 2.2-10.67 7.12-.98 4.9 2.23 9.66 7.12 10.65l1.27.26c5.62 1.11 9.27 6.58 8.13 12.17l-.49 2.54c-1.11 5.62 2.54 11.09 8.13 12.2 5.62 1.11 11.09-2.54 12.2-8.16l.49-2.54c1.11-5.6 6.58-9.25 12.17-8.13l7.64 1.53c8.42 1.66 16.6-3.81 18.26-12.23 1.68-8.42-3.78-16.6-12.2-18.26Z" />
    </svg>
  );
}

type Props = {
  invoiceId: string;
  /** Formatted "voucher id · synced date" when already pushed, else null. */
  syncedLabel: string | null;
  /** Non-null blocks the button with a reason (config gaps, wrong status). */
  blockedReason: string | null;
};

/**
 * e-conomic sync strip on the invoice detail. Pushing creates a DRAFT
 * journal voucher in e-conomic (the bookkeeper books it there) and stamps
 * economic_voucher_id — one push per invoice.
 */
export function EconomicSyncCard({
  invoiceId,
  syncedLabel,
  blockedReason,
}: Props) {
  const t = useTranslations("invoiceDetail");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (syncedLabel) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          {t("economicPushedAs")}
        </span>
        <span className="font-medium tabular-nums">{syncedLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">
          {t("economicNotPushed")}
        </span>
        {/* e-conomic brand orange (#ef7d00 CTA / #e86807 hover on
            e-conomic.com) — the push button wears the destination's colour. */}
        <Button
          size="sm"
          className="bg-[#ef7d00] text-white hover:bg-[#e86807]"
          disabled={pending || blockedReason != null}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await pushInvoiceToEconomicAction(invoiceId);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          <EconomicMark className="size-3.5" />
          {pending ? t("pushing") : t("pushToEconomic")}
        </Button>
      </div>
      {blockedReason ? (
        <p className="text-muted-foreground text-xs">{blockedReason}</p>
      ) : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
