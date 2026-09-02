"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Mail, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColorChip } from "@/components/color-swatch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SERVICE_ORDER_STATUS_VARIANT,
  serviceOrderTransitionRequiresReason,
  validNextServiceOrderStatuses,
  type ServiceOrderStatus,
} from "@/lib/services/status";

import { emailServiceOrderToSupplier } from "../_actions/email-service-order";
import { transitionServiceOrderStatus } from "../_actions/transition-status";

type PendingTransition = { to: ServiceOrderStatus } | null;

type Props = {
  serviceOrderId: string;
  orderNumber: string;
  status: ServiceOrderStatus;
  supplierId: string | null;
  supplierName: string | null;
  colorName: string | null;
  colorHex: string | null;
  colorFinish: string | null;
  /** Last-send stamp (migration 89); null = never emailed. */
  emailedAt: string | null;
  emailedTo: string | null;
  /** Outbound test mode + its inboxes, so the dialog says where mail really goes. */
  emailTestMode: boolean;
  emailTestRecipients: string | null;
  /** The supplier's own addresses — what the mail really goes to. */
  supplierEmails: string[];
  /** Saved on the supplier; seeds the message box, edits never write back. */
  supplierDefaultMessage: string | null;
};

export function PaintOrderHeader({
  serviceOrderId,
  orderNumber,
  status,
  supplierId,
  supplierName,
  colorName,
  colorHex,
  colorFinish,
  emailedAt,
  emailedTo,
  emailTestMode,
  emailTestRecipients,
  supplierEmails,
  supplierDefaultMessage,
}: Props) {
  const t = useTranslations("paintOrderDetail");
  const tStatus = useTranslations("serviceOrderStatus");
  const svcStatus = (s: string) => (tStatus.has(s) ? tStatus(s) : s);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] =
    useState<PendingTransition>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const nextStatuses = validNextServiceOrderStatuses(status);
  // Terminal orders are history; anything open can (re)send the document.
  const canEmail = status !== "cancelled" && status !== "received_back";

  function startTransition(to: ServiceOrderStatus) {
    if (serviceOrderTransitionRequiresReason(to)) {
      setTransitionDialog({ to });
    } else {
      runTransition(to, null);
    }
  }

  function runTransition(to: ServiceOrderStatus, reason: string | null) {
    setError(null);
    start(async () => {
      const r = await transitionServiceOrderStatus(serviceOrderId, to, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Receiving back converts raw stock into painted stock line by line;
      // say what happened, including lines that named no part and so could not.
      if (r.conversion) {
        setInfo(
          t("receivedConversion", {
            converted: r.conversion.converted,
            skipped: r.conversion.skippedNoPart,
            failed: r.conversion.failures.length,
          }),
        );
      }
      setTransitionDialog(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p
          className="bg-good-wash text-good rounded-lg px-4 py-2 text-sm"
          role="status"
        >
          {info}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {orderNumber}
            </span>
            <Badge variant={SERVICE_ORDER_STATUS_VARIANT[status] ?? "outline"}>
              {svcStatus(status)}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {supplierId && supplierName ? (
              <Link
                href={`/admin/suppliers/${supplierId}`}
                className="hover:underline"
              >
                {supplierName}
              </Link>
            ) : (
              (supplierName ?? t("orderFallback"))
            )}
          </h1>
          {colorName ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <ColorChip hex={colorHex} label={colorName} />
              {colorFinish ? (
                <span className="text-xs">{colorFinish}</span>
              ) : null}
            </p>
          ) : null}
          {emailedAt ? (
            <p className="text-muted-foreground text-xs">
              {t("emailedPrefix", {
                date: new Date(emailedAt).toLocaleDateString("da-DK"),
              })}
              {emailedTo ? (
                <>
                  {t("emailedToPrefix")}
                  <span className="font-mono">
                    {emailedTo.startsWith("test:") ? (
                      <>
                        <span className="rounded bg-money-wash px-1 py-0.5 text-[10px] font-medium text-money">
                          {t("testBadge")}
                        </span>{" "}
                        {emailedTo.slice(5)}
                      </>
                    ) : (
                      emailedTo
                    )}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/paint-orders/${serviceOrderId}/print`}>
              <Printer aria-hidden /> {t("print")}
            </Link>
          </Button>
          {canEmail ? (
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(true)}
              disabled={pending}
            >
              <Mail aria-hidden /> {t("emailPainter")}
            </Button>
          ) : null}
          {nextStatuses.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pending}>
                  {t("moveTo")} <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {nextStatuses.map((to, i) => {
                  const isTerminal = serviceOrderTransitionRequiresReason(to);
                  return (
                    <div key={to}>
                      {i > 0 && isTerminal ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        variant={isTerminal ? "destructive" : "default"}
                        disabled={pending}
                        onSelect={(e) => {
                          e.preventDefault();
                          startTransition(to);
                        }}
                      >
                        {svcStatus(to)}
                      </DropdownMenuItem>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <CancelReasonDialog
        pending={transitionDialog}
        isPending={pending}
        onCancel={() => setTransitionDialog(null)}
        onSubmit={(reason) =>
          transitionDialog && runTransition(transitionDialog.to, reason)
        }
      />

      <EmailPainterDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        serviceOrderId={serviceOrderId}
        orderNumber={orderNumber}
        supplierName={supplierName}
        willMarkSent={status === "planned"}
        testMode={emailTestMode}
        testRecipients={emailTestRecipients}
        supplierEmails={supplierEmails}
        defaultMessage={supplierDefaultMessage}
        onSent={() => router.refresh()}
      />
    </div>
  );
}

/**
 * Confirm-and-send dialog. The optional message is the only free text that
 * reaches the painter (order/line notes stay internal). While outbound test
 * mode is on, the copy says exactly where the mail will really go; while the
 * order is still planned, it says that emailing marks it sent.
 */
function EmailPainterDialog({
  open,
  onOpenChange,
  serviceOrderId,
  orderNumber,
  supplierName,
  willMarkSent,
  testMode,
  testRecipients,
  supplierEmails,
  defaultMessage,
  onSent,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  serviceOrderId: string;
  orderNumber: string;
  supplierName: string | null;
  willMarkSent: boolean;
  testMode: boolean;
  testRecipients: string | null;
  supplierEmails: string[];
  defaultMessage: string | null;
  onSent: () => void;
}) {
  const t = useTranslations("paintOrderDetail");
  const tCommon = useTranslations("common");
  const [message, setMessage] = useState(defaultMessage ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{
    to: string;
    markedSent: boolean;
  } | null>(null);
  const [isSending, startSending] = useTransition();
  // Re-seed on every opening. The dialog stays mounted for the page's
  // lifetime, so without this a message edited and then cancelled would come
  // back on the next send instead of the supplier's saved text. This is the
  // documented adjust-state-when-props-change shape, not an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMessage(defaultMessage ?? "");
  }
  // No address and no test inbox to catch it = nothing to send to. Say it here
  // rather than failing in the action after the click.
  const noRecipient = supplierEmails.length === 0 && !testMode;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startSending(async () => {
      const r = await emailServiceOrderToSupplier(
        serviceOrderId,
        message.trim() || null,
      );
      if (!r.ok) {
        setError(r.error);
        // A planned order may have moved to sent before the failure — show it.
        onSent();
        return;
      }
      setSentTo({
        to: `${r.testMode ? "test: " : ""}${r.to.join(", ")}`,
        markedSent: r.markedSent,
      });
      onSent();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setError(null);
          setSentTo(null);
          setMessage("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {sentTo ? (
          <div className="flex flex-col gap-4">
            <UiDialogHeader>
              <DialogTitle>{t("emailSentTitle")}</DialogTitle>
              <DialogDescription>
                {t.rich("emailSentDesc", {
                  order: orderNumber,
                  to: sentTo.to,
                  mono: (chunks) => <span className="font-mono">{chunks}</span>,
                })}
                {sentTo.markedSent ? ` ${t("emailSentMarked")}` : null}
              </DialogDescription>
            </UiDialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("done")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <UiDialogHeader>
              <DialogTitle>
                {t("emailTitle", {
                  order: orderNumber,
                  supplier: supplierName ?? t("theSupplier"),
                })}
              </DialogTitle>
              <DialogDescription>{t("emailDesc")}</DialogDescription>
            </UiDialogHeader>

            {/* Which address, spelled out. "their email on file" was true and
                useless — you could not tell whether it was the right one
                without opening the supplier in another tab. */}
            {supplierEmails.length > 0 ? (
              <p className="text-ink-2 text-xs">
                {testMode ? t("emailIntendedPrefix") : t("emailGoesToPrefix")}{" "}
                <span className="text-ink-1 font-mono">
                  {supplierEmails.join(", ")}
                </span>
              </p>
            ) : (
              <p className="rounded-md border border-money/30 bg-money-wash px-3 py-2 text-xs text-money">
                {t("emailNoRecipient", {
                  supplier: supplierName ?? t("theSupplier"),
                })}
              </p>
            )}

            {willMarkSent ? (
              <p className="rounded-md border border-brand/30 bg-brand-wash px-3 py-2 text-xs text-brand">
                {t("emailWillMarkSent")}
              </p>
            ) : null}

            {testMode ? (
              <p className="rounded-md border border-money/30 bg-money-wash px-3 py-2 text-xs text-money">
                {t.rich("testModeBanner", {
                  recipients: testRecipients ?? t("noTestInbox"),
                  mono: (chunks) => <span className="font-mono">{chunks}</span>,
                })}
              </p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paint-email-message">{t("messageLabel")}</Label>
              <Textarea
                id="paint-email-message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
              />
            </div>

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSending}
              >
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={isSending || noRecipient}>
                {isSending ? t("sending") : t("sendEmail")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CancelReasonDialog({
  pending,
  isPending,
  onCancel,
  onSubmit,
}: {
  pending: PendingTransition;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const t = useTranslations("paintOrderDetail");
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={pending != null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
          setReason("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(reason);
          }}
          className="flex flex-col gap-4"
        >
          <UiDialogHeader>
            <DialogTitle>{t("cancelTitle")}</DialogTitle>
            <DialogDescription>{t("cancelDesc")}</DialogDescription>
          </UiDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-cancel-reason">{t("reason")}</Label>
            <Textarea
              id="paint-cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("cancelReasonPlaceholder")}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onCancel();
                setReason("");
              }}
              disabled={isPending}
            >
              {t("keepOpen")}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isPending || reason.trim() === ""}
            >
              {isPending ? t("cancelling") : t("cancelPo")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
