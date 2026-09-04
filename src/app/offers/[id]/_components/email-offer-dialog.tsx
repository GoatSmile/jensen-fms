"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { emailOfferToCustomer } from "../../_actions/email-offer";

/**
 * Email the offer to the customer.
 *
 * The dialog says plainly that sending IS the send — a draft becomes `sent`
 * and its lines freeze — because that is a state change the button's label
 * alone does not admit to. The message box is the ONLY free text that reaches
 * the customer; `offers.notes` stays inside the building.
 */
export function EmailOfferDialog({
  offerId,
  isDraft,
  testMode,
  testRecipients,
}: {
  offerId: string;
  isDraft: boolean;
  testMode: boolean;
  testRecipients: string | null;
}) {
  const t = useTranslations("offerDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const r = await emailOfferToCustomer(offerId, message);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setMessage("");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Mail aria-hidden /> {t("emailCustomer")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("emailTitle")}</DialogTitle>
            <DialogDescription>
              {isDraft ? t("emailBodyDraft") : t("emailBodySent")}
            </DialogDescription>
          </DialogHeader>

          {testMode ? (
            <p className="bg-money-wash text-money rounded-md px-3 py-2 text-xs">
              {t("emailTestMode", {
                to: testRecipients ?? t("emailTestNoRecipient"),
              })}
            </p>
          ) : null}

          <Textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("emailMessagePlaceholder")}
            disabled={pending}
          />
          <p className="text-muted-foreground text-xs">{t("emailNotesStay")}</p>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={send} disabled={pending}>
              {pending ? tCommon("saving") : t("emailSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
