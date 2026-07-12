"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BadgeCheck, Banknote, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { InvoiceStatus } from "@/lib/invoicing/status";

import { createCreditNote } from "../_actions/create-credit-note";
import {
  cancelDraftInvoice,
  issueInvoice,
  markInvoicePaid,
} from "../_actions/transition-invoice";

type Props = {
  invoiceId: string;
  status: InvoiceStatus;
  /** Credit notes can't be credited again or marked paid. */
  isCreditNote?: boolean;
  /** A live (non-cancelled) credit note already covers this invoice. */
  hasLiveCreditNote?: boolean;
};

/**
 * Status actions on the invoice detail page. Issuing is irreversible
 * (assigns the sequential INV number + locks the invoice), so it arms a
 * two-step confirm instead of firing on first click.
 */
export function InvoiceActions({
  invoiceId,
  status,
  isCreditNote = false,
  hasLiveCreditNote = false,
}: Props) {
  const t = useTranslations("invoiceDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [armedIssue, setArmedIssue] = useState(false);
  const [isPending, start] = useTransition();

  function onCreditNote() {
    setError(null);
    start(async () => {
      // Redirects to the new credit-note draft; only errors land here.
      const r = await createCreditNote(invoiceId);
      if (r && !r.ok) setError(r.error);
    });
  }

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
              <Trash2 aria-hidden /> {t("cancelDraft")}
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
                  {t("keepDraft")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(() => issueInvoice(invoiceId))}
                >
                  <BadgeCheck aria-hidden />
                  {isPending
                    ? t("issuing")
                    : isCreditNote
                      ? t("confirmIssueCreditNote")
                      : t("confirmIssueLock")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => setArmedIssue(true)}
              >
                <BadgeCheck aria-hidden />{" "}
                {isCreditNote ? t("issueCreditNote") : t("issueInvoice")}
              </Button>
            )}
          </>
        ) : null}
        {(status === "issued" || status === "overdue") && !isCreditNote ? (
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => markInvoicePaid(invoiceId))}
          >
            <Banknote aria-hidden />
            {isPending ? tCommon("saving") : t("markPaid")}
          </Button>
        ) : null}
        {["issued", "overdue", "paid"].includes(status) &&
        !isCreditNote &&
        !hasLiveCreditNote ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onCreditNote}
          >
            <Undo2 aria-hidden />
            {isPending ? t("creating") : t("createCreditNote")}
          </Button>
        ) : null}
      </div>
      {armedIssue && status === "draft" ? (
        <p className="text-muted-foreground max-w-[340px] text-right text-xs">
          {t("issueWarning")}
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
