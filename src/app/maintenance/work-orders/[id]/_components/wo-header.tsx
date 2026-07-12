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

  const nextStatuses = validNextWOStatuses(status);

  function startTransition(to: WorkOrderStatus) {
    if (woTransitionRequiresReason(to)) {
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
        onCancel={() => setTransitionDialog(null)}
        onSubmit={(reason) =>
          transitionDialog && runTransition(transitionDialog.to, reason)
        }
      />
    </div>
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
