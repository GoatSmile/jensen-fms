"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  SO_STATUS_VARIANT,
  soStatusLabel,
  soTransitionRequiresReason,
  validNextSOStatuses,
  type SOStatus,
} from "@/lib/so/status";

import { transitionSO } from "../_actions/transition-so";

type PendingTransition = { to: SOStatus } | null;

type Props = {
  soId: string;
  soNumber: string;
  status: SOStatus;
  customerName: string;
  customerId: string;
  unitName: string | null;
};

export function SOHeader({
  soId,
  soNumber,
  status,
  customerName,
  customerId,
  unitName,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] = useState<PendingTransition>(null);

  const nextStatuses = validNextSOStatuses(status);

  function beginTransition(to: SOStatus) {
    if (soTransitionRequiresReason(to)) {
      setTransitionDialog({ to });
    } else {
      runTransition(to, null);
    }
  }

  function runTransition(to: SOStatus, reason: string | null) {
    setError(null);
    start(async () => {
      const r = await transitionSO(soId, to, reason);
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
              {soNumber}
            </span>
            <Badge variant={SO_STATUS_VARIANT[status] ?? "outline"}>
              {soStatusLabel(status)}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link
              href={`/organizations/${customerId}`}
              className="hover:underline"
            >
              {customerName}
            </Link>
          </h1>
          {unitName ? (
            <p className="text-muted-foreground text-sm">{unitName}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {status === "draft" ? (
            <Button asChild variant="outline">
              <Link href={`/sales-orders/${soId}/edit`}>
                <Pencil aria-hidden /> Edit
              </Link>
            </Button>
          ) : null}
          {nextStatuses.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pending}>
                  Move to <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {nextStatuses.map((to, i) => {
                  const isTerminal = soTransitionRequiresReason(to);
                  return (
                    <div key={to}>
                      {i > 0 && isTerminal ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        variant={isTerminal ? "destructive" : "default"}
                        disabled={pending}
                        onSelect={(e) => {
                          e.preventDefault();
                          beginTransition(to);
                        }}
                      >
                        {soStatusLabel(to)}
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
            <DialogTitle>Cancel sales order?</DialogTitle>
            <DialogDescription>
              The SO will be cancelled and any unbuilt bikes linked to it
              get unslated (their owner pointer cleared). Built bikes stay
              slated — the workshop unpacks the orphan by hand. The reason
              is appended to the SO notes for the audit trail.
            </DialogDescription>
          </UiDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="so-cancel-reason">Reason</Label>
            <Textarea
              id="so-cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer cancelled the order before any bikes were built."
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
              Keep open
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isPending || reason.trim() === ""}
            >
              {isPending ? "Cancelling…" : "Cancel SO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
