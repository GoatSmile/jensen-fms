"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Banknote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { InvoiceStatus } from "@/lib/invoicing/status";

import {
  cancelDraftInvoice,
  issueInvoice,
  markInvoicePaid,
} from "../_actions/transition-invoice";

type Props = {
  invoiceId: string;
  status: InvoiceStatus;
};

/**
 * Status actions on the invoice detail page. Issuing is irreversible
 * (assigns the sequential INV number + locks the invoice), so it arms a
 * two-step confirm instead of firing on first click.
 */
export function InvoiceActions({ invoiceId, status }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [armedIssue, setArmedIssue] = useState(false);
  const [isPending, start] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setArmedIssue(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === "draft" ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => cancelDraftInvoice(invoiceId))}
            >
              <Trash2 aria-hidden /> Cancel draft
            </Button>
            {armedIssue ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setArmedIssue(false)}
                >
                  Keep as draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(() => issueInvoice(invoiceId))}
                >
                  <BadgeCheck aria-hidden />
                  {isPending ? "Issuing…" : "Confirm — issue and lock"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => setArmedIssue(true)}
              >
                <BadgeCheck aria-hidden /> Issue invoice
              </Button>
            )}
          </>
        ) : null}
        {status === "issued" || status === "overdue" ? (
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => markInvoicePaid(invoiceId))}
          >
            <Banknote aria-hidden />
            {isPending ? "Saving…" : "Mark paid"}
          </Button>
        ) : null}
      </div>
      {armedIssue && status === "draft" ? (
        <p className="text-muted-foreground max-w-[340px] text-right text-xs">
          Issuing assigns the next sequential invoice number and locks the
          invoice — it can&apos;t be edited or cancelled afterwards.
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive text-right text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
