"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, RotateCcw, Send, ShoppingCart, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  canConvertToSalesOrder,
  canReopenForRevision,
  validNextStatuses,
  type OfferStatus,
} from "@/lib/offers/status";

import { convertOfferToSalesOrder } from "../../_actions/convert-to-so";
import {
  reopenOfferForRevision,
  sendOffer,
  transitionOffer,
} from "../../_actions/transition-offer";

/**
 * What can be done to this offer right now.
 *
 * Two of these deserve their confirmation: reopening bumps the revision, so
 * the customer's copy and ours stop matching until it is re-sent; converting
 * writes a sales order and closes the offer to further revisions.
 */
export function OfferActions({
  offerId,
  status,
  revision,
}: {
  offerId: string;
  status: OfferStatus;
  revision: number;
}) {
  const t = useTranslations("offerDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"reopen" | "convert" | null>(null);

  const next = validNextStatuses(status);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      // convertOfferToSalesOrder redirects on success, so only a failure lands.
      if (r && !r.ok) {
        setError(r.error ?? null);
        setConfirm(null);
        return;
      }
      setConfirm(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {status === "draft" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => sendOffer(offerId))}
          >
            <Send aria-hidden /> {t("markSent")}
          </Button>
        ) : null}

        {next.includes("accepted") ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => transitionOffer(offerId, "accepted"))}
          >
            <Check aria-hidden /> {t("markAccepted")}
          </Button>
        ) : null}

        {next.includes("rejected") ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => transitionOffer(offerId, "rejected"))}
          >
            <X aria-hidden /> {t("markRejected")}
          </Button>
        ) : null}

        {canReopenForRevision(status) ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setConfirm("reopen")}
          >
            <RotateCcw aria-hidden /> {t("reopen")}
          </Button>
        ) : null}

        {canConvertToSalesOrder(status) ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => setConfirm("convert")}
          >
            <ShoppingCart aria-hidden /> {t("convert")}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "reopen" ? t("reopenTitle") : t("convertTitle")}
            </DialogTitle>
            <DialogDescription>
              {confirm === "reopen"
                ? t("reopenBody", { next: revision + 1 })
                : t("convertBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(() =>
                  confirm === "reopen"
                    ? reopenOfferForRevision(offerId)
                    : convertOfferToSalesOrder(offerId),
                )
              }
            >
              {confirm === "reopen" ? t("reopenConfirm") : t("convertConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
