"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookUp2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { pushInvoiceToEconomicAction } from "../_actions/push-economic";

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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (syncedLabel) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          e-conomic: pushed as draft voucher
        </span>
        <span className="font-medium tabular-nums">{syncedLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">
          e-conomic: not pushed yet
        </span>
        {/* Visma brand purple (--visma-purple on visma.com) — e-conomic is a
            Visma product, so the push button wears the destination's colour. */}
        <Button
          size="sm"
          className="bg-[#7f56fa] text-white hover:bg-[#6a45e6]"
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
          <BookUp2 aria-hidden />
          {pending ? "Pushing…" : "Push to e-conomic"}
        </Button>
      </div>
      {blockedReason ? (
        <p className="text-muted-foreground text-xs">{blockedReason}</p>
      ) : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
