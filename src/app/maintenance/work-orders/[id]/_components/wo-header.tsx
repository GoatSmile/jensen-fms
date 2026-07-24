"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

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
import { formatDateTime } from "@/lib/parts/format";
import {
  WO_STATUS_VARIANT,
  woTransitionRequiresReason,
  validNextWOStatuses,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

import { transitionWO } from "../../_actions/transition-wo";

type PendingTransition = { to: WorkOrderStatus } | null;

type Props = {
  woId: string;
  woNumber: string;
  status: WorkOrderStatus;
  isBillable: boolean;
  coveredByAgreementName: string | null;
  headline: string | null;
  bikeId: string;
  bikeFrameNumber: string;
  bikeTypeName: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export function WOHeader({
  woId,
  woNumber,
  status,
  isBillable,
  coveredByAgreementName,
  headline,
  bikeId,
  bikeFrameNumber,
  bikeTypeName,
  ticketId,
  ticketNumber,
  startedAt,
  completedAt,
}: Props) {
  const t = useTranslations("workOrders");
  const tWoStatus = useTranslations("woStatus");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] =
    useState<PendingTransition>(null);
  // Completing is terminal + auto-resolves a linked ticket, so it confirms
  // first (naming that consequence) rather than firing straight off the
  // dropdown — same reasoning as the floor "Mark done".
  const [confirmComplete, setConfirmComplete] = useState(false);

  const nextStatuses = validNextWOStatuses(status);

  function startTransition(to: WorkOrderStatus) {
    if (to === "completed") {
      setError(null);
      setConfirmComplete(true);
    } else if (woTransitionRequiresReason(to)) {
      setTransitionDialog({ to });
    } else {
      runTransition(to, null);
    }
  }

  function runTransition(to: WorkOrderStatus, reason: string | null) {
    setError(null);
    start(async () => {
      const r = await transitionWO(woId, to, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTransitionDialog(null);
      setConfirmComplete(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Errors from a dialog transition render inside that dialog, not here
          behind the overlay (matters especially for cancel, which now also
          reverses consumed inventory and can fail). */}
      {error && !transitionDialog && !confirmComplete ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {woNumber}
            </span>
            <Badge variant={WO_STATUS_VARIANT[status] ?? "outline"}>
              {tWoStatus(status)}
            </Badge>
            {isBillable ? (
              <Badge variant="outline" className="font-normal">
                {t("billable")}
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="font-normal"
                title={
                  coveredByAgreementName
                    ? t("coveredByAgreement", { name: coveredByAgreementName })
                    : t("coveredByAgreementBare")
                }
              >
                {t("covered")}
              </Badge>
            )}
            {bikeTypeName ? (
              <Badge variant="outline" className="font-normal">
                {bikeTypeName}
              </Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {headline && headline.trim() !== "" ? (
              headline
            ) : (
              <span className="italic">{t("woFallback")}</span>
            )}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>
              {t("bikeLabel")}{" "}
              <Link
                href={`/bikes/${bikeId}`}
                className="hover:text-foreground font-mono underline-offset-4 hover:underline"
              >
                {bikeFrameNumber}
              </Link>
            </span>
            {ticketId && ticketNumber ? (
              <span>
                {t("ticketLabel")}{" "}
                <Link
                  href={`/maintenance/tickets/${ticketId}`}
                  className="hover:text-foreground font-mono underline-offset-4 hover:underline"
                >
                  {ticketNumber}
                </Link>
              </span>
            ) : null}
            {startedAt ? (
              <span>{t("startedAt", { date: formatDateTime(startedAt) })}</span>
            ) : null}
            {completedAt ? (
              <span>
                {t("completedAt", { date: formatDateTime(completedAt) })}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          {nextStatuses.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pending}>
                  {t("moveTo")} <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {nextStatuses.map((to, i) => {
                  const isTerminal = woTransitionRequiresReason(to);
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
                        {tWoStatus(to)}
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
        error={error}
        onCancel={() => {
          setTransitionDialog(null);
          setError(null);
        }}
        onSubmit={(reason) =>
          transitionDialog && runTransition(transitionDialog.to, reason)
        }
      />

      <CompleteConfirmDialog
        open={confirmComplete}
        isPending={pending}
        resolvesTicketNumber={ticketId ? ticketNumber : null}
        error={error}
        onCancel={() => {
          setConfirmComplete(false);
          setError(null);
        }}
        onConfirm={() => runTransition("completed", null)}
      />
    </div>
  );
}

function CompleteConfirmDialog({
  open,
  isPending,
  resolvesTicketNumber,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  isPending: boolean;
  resolvesTicketNumber: string | null;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("workOrders");
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <UiDialogHeader>
          <DialogTitle>{t("completeTitle")}</DialogTitle>
          <DialogDescription>
            {resolvesTicketNumber
              ? t("completeResolvesBody", { ticket: resolvesTicketNumber })
              : t("completeBody")}
          </DialogDescription>
        </UiDialogHeader>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            {t("completeKeepOpen")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            {isPending ? t("completing") : t("completeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelReasonDialog({
  pending,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  pending: PendingTransition;
  isPending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const t = useTranslations("workOrders");
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
            <Label htmlFor="wo-cancel-reason">{t("reason")}</Label>
            <Textarea
              id="wo-cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("cancelReasonPlaceholder")}
              autoFocus
              required
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
              {isPending ? t("cancelling") : t("cancelWorkOrder")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
