"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDkk } from "@/lib/parts/stock";

import {
  createAgreementFeeInvoices,
  type FeeInvoicesResult,
} from "../_actions/create-agreement-fee-invoices";

/**
 * "Draft fee invoices" on the agreements section — one click drafts the
 * per-customer arrears invoices for every unbilled agreement-month.
 * Mirrors the reorder-banner UX: success lists the drafts with links.
 */
export function DraftFeeInvoicesButton() {
  const router = useRouter();
  const [result, setResult] = useState<FeeInvoicesResult | null>(null);
  const [isPending, start] = useTransition();

  function onDraft() {
    setResult(null);
    start(async () => {
      const r = await createAgreementFeeInvoices();
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" size="sm" onClick={onDraft} disabled={isPending}>
          <CalendarClock aria-hidden />
          {isPending ? "Drafting…" : "Draft fee invoices"}
        </Button>
      </div>
      {result ? (
        result.ok ? (
          <p className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
            Drafted{" "}
            {result.invoices.map((inv, i) => (
              <span key={inv.id}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/invoices/${inv.id}`}
                  className="font-medium underline underline-offset-4"
                >
                  {inv.orgName}
                </Link>{" "}
                ({inv.lines} line{inv.lines === 1 ? "" : "s"}, {formatDkk(inv.total)})
              </span>
            ))}
            . Review and issue from there.
            {result.skipped.length > 0 ? (
              <span className="text-muted-foreground block text-xs">
                Skipped: {result.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-destructive text-sm" role="alert">
            {result.error}
          </p>
        )
      ) : null}
    </div>
  );
}
