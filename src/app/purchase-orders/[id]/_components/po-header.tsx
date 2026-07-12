"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Mail, Pencil, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  PO_STATUS_VARIANT,
  poTransitionRequiresReason,
  validNextPOStatuses,
  type PurchaseOrderStatus,
} from "@/lib/po/status";

import { transitionPO } from "../../_actions/transition-po";
import { emailPOToSupplier } from "../_actions/email-po";

type PendingTransition = { to: PurchaseOrderStatus } | null;

type Props = {
  poId: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierName: string | null;
  supplierId: string | null;
  /** Last-send stamp (migration 57); null = never emailed. */
  emailedAt: string | null;
  emailedTo: string | null;
  /** Outbound test mode from app_settings — drives the send dialog copy. */
  emailTestMode: boolean;
  /** Test inboxes (comma-separated) shown in the dialog while test mode is on. */
  emailTestRecipients: string | null;
};

export function POHeader({
  poId,
  poNumber,
  status,
  supplierName,
  supplierId,
  emailedAt,
  emailedTo,
  emailTestMode,
  emailTestRecipients,
}: Props) {
  const t = useTranslations("poDetail");
  const tStatus = useTranslations("poStatus");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] =
    useState<PendingTransition>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const nextStatuses = validNextPOStatuses(status);

  function startTransition(to: PurchaseOrderStatus) {
    if (poTransitionRequiresReason(to)) {
      setTransitionDialog({ to });
    } else {
      runTransition(to, null);
    }
  }

  function runTransition(to: PurchaseOrderStatus, reason: string | null) {
    setError(null);
    start(async () => {
      const r = await transitionPO(poId, to, reason);
      if (!r.ok) {
        setError(r.error);
        return;
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {poNumber}
            </span>
            <Badge variant={PO_STATUS_VARIANT[status] ?? "outline"}>
              {tStatus.has(status) ? tStatus(status) : status}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {supplierId && supplierName ? (
              <Link
                href={`/suppliers/${supplierId}`}
                className="hover:underline"
              >
                {supplierName}
              </Link>
            ) : (
              supplierName ?? "—"
            )}
          </h1>
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
                        <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
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
        <div className="flex gap-2">
          {status === "draft" ? (
            <Button variant="outline" asChild>
              <Link href={`/purchase-orders/${poId}/edit`}>
                <Pencil aria-hidden /> {t("edit")}
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href={`/purchase-orders/${poId}/print`}>
              <Printer aria-hidden /> {t("print")}
            </Link>
          </Button>
          {status !== "cancelled" ? (
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(true)}
              disabled={pending}
            >
              <Mail aria-hidden /> {t("emailSupplier")}
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
                  const isTerminal = poTransitionRequiresReason(to);
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
                        {tStatus.has(to) ? tStatus(to) : to}
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

      <EmailSupplierDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        poId={poId}
        poNumber={poNumber}
        supplierName={supplierName}
        testMode={emailTestMode}
        testRecipients={emailTestRecipients}
        onSent={() => router.refresh()}
      />
    </div>
  );
}

/**
 * Confirm-and-send dialog. The optional message is the only free text that
 * reaches the supplier (PO/line notes stay internal). While outbound test
 * mode is on, the copy says exactly where the mail will really go.
 */
function EmailSupplierDialog({
  open,
  onOpenChange,
  poId,
  poNumber,
  supplierName,
  testMode,
  testRecipients,
  onSent,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  poId: string;
  poNumber: string;
  supplierName: string | null;
  testMode: boolean;
  testRecipients: string | null;
  onSent: () => void;
}) {
  const t = useTranslations("poDetail");
  const tCommon = useTranslations("common");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startSending(async () => {
      const r = await emailPOToSupplier(poId, message.trim() || null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSentTo(`${r.testMode ? "test: " : ""}${r.to.join(", ")}`);
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
                  po: poNumber,
                  to: sentTo,
                  mono: (chunks) => (
                    <span className="font-mono">{chunks}</span>
                  ),
                })}
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
              <DialogTitle>{t("emailTitle", { po: poNumber })}</DialogTitle>
              <DialogDescription>
                {t("emailDesc", {
                  supplier: supplierName ?? t("theSupplier"),
                })}
              </DialogDescription>
            </UiDialogHeader>

            {testMode ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {t.rich("testModeBanner", {
                  recipients: testRecipients ?? t("noTestInbox"),
                  mono: (chunks) => (
                    <span className="font-mono">{chunks}</span>
                  ),
                })}
              </p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-email-message">{t("messageLabel")}</Label>
              <Textarea
                id="po-email-message"
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
              <Button type="submit" disabled={isSending}>
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
  const t = useTranslations("poDetail");
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
            <Label htmlFor="po-cancel-reason">{t("reason")}</Label>
            <Textarea
              id="po-cancel-reason"
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
