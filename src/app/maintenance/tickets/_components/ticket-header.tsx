"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Pencil } from "lucide-react";

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
  TICKET_STATUS_VARIANT,
  ticketPriorityVariant,
  ticketTransitionRequiresReason,
  validNextTicketStatuses,
  type TicketStatus,
} from "@/lib/maintenance/ticket-status";

import { transitionTicket } from "../_actions/transition-ticket";

type PendingTransition = { to: TicketStatus } | null;

type Props = {
  ticketId: string;
  ticketNumber: string;
  status: TicketStatus;
  priority: number;
  description: string;
  bikeId: string;
  bikeFrameNumber: string;
  bikeTypeName: string | null;
  ownerOrganizationId: string | null;
  ownerName: string | null;
};

function summariseDescription(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 60).trimEnd()}…`;
}

export function TicketHeader({
  ticketId,
  ticketNumber,
  status,
  priority,
  description,
  bikeId,
  bikeFrameNumber,
  bikeTypeName,
  ownerOrganizationId,
  ownerName,
}: Props) {
  const t = useTranslations("tickets");
  const tStatus = useTranslations("ticketStatus");
  const tPriority = useTranslations("ticketPriority");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] =
    useState<PendingTransition>(null);

  const nextStatuses = validNextTicketStatuses(status);
  const headline =
    summariseDescription(description) || t("ticketFallback", { number: ticketNumber });

  function startTransition(to: TicketStatus) {
    if (ticketTransitionRequiresReason(to)) {
      setTransitionDialog({ to });
    } else {
      runTransition(to, null);
    }
  }

  function runTransition(to: TicketStatus, reason: string | null) {
    setError(null);
    start(async () => {
      const r = await transitionTicket(ticketId, to, reason);
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
              {ticketNumber}
            </span>
            <Badge variant={TICKET_STATUS_VARIANT[status] ?? "outline"}>
              {tStatus(status)}
            </Badge>
            <Badge variant={ticketPriorityVariant(priority)}>
              {tPriority(String(priority))}
            </Badge>
            {bikeTypeName ? (
              <Badge variant="outline" className="font-normal">
                {bikeTypeName}
              </Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{headline}</h1>
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
            {ownerOrganizationId && ownerName ? (
              <span>
                {t("ownerLabel")}{" "}
                <Link
                  href={`/organizations/${ownerOrganizationId}`}
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  {ownerName}
                </Link>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/maintenance/tickets/${ticketId}/edit`}>
              <Pencil aria-hidden /> {t("edit")}
            </Link>
          </Button>
          {nextStatuses.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pending}>
                  {t("moveTo")} <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {nextStatuses.map((to, i) => {
                  const isTerminal = ticketTransitionRequiresReason(to);
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
                        {tStatus(to)}
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
  const t = useTranslations("tickets");
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
            <Label htmlFor="ticket-cancel-reason">{t("reason")}</Label>
            <Textarea
              id="ticket-cancel-reason"
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
              {isPending ? t("cancelling") : t("cancelTicket")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
