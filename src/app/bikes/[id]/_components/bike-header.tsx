"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArchiveRestore,
  ChevronDown,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

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
  BIKE_STATUS_VARIANT,
  bikeStatusLabel,
  transitionRequiresReason,
  validNextStatuses,
  type BikeStatus,
} from "@/lib/bikes/status";

import { deleteBike, restoreBike } from "../_actions/delete-bike";
import { transitionBike } from "../_actions/transition-bike";

type Props = {
  bikeId: string;
  frameNumber: string;
  status: BikeStatus;
  bikeTypeName: string | null;
  templateLabel: string | null;
  colorName: string | null;
  colorHex: string | null;
  isDeleted: boolean;
  /**
   * Slot for the "Assign to customer" action. Lives on the page (server
   * component) because it loads the orgs + units list; injected here so
   * the header keeps its existing layout responsibility.
   */
  assignAction?: React.ReactNode;
};

type PendingTransition = { to: BikeStatus } | null;

export function BikeHeader({
  bikeId,
  frameNumber,
  status,
  bikeTypeName,
  templateLabel,
  colorName,
  colorHex,
  isDeleted,
  assignAction,
}: Props) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] =
    useState<PendingTransition>(null);

  const nextStatuses = validNextStatuses(status);

  function runDelete() {
    setActionError(null);
    start(async () => {
      const r = await deleteBike(bikeId);
      if (!r.ok) {
        setActionError(r.error);
        setConfirmDelete(false);
      } else {
        router.refresh();
      }
    });
  }

  function runRestore() {
    setActionError(null);
    start(async () => {
      const r = await restoreBike(bikeId);
      if (!r.ok) setActionError(r.error);
      else router.refresh();
    });
  }

  function startTransition(to: BikeStatus) {
    if (transitionRequiresReason(to)) {
      setTransitionDialog({ to });
    } else {
      runTransition(to, null);
    }
  }

  function runTransition(to: BikeStatus, reason: string | null) {
    setActionError(null);
    start(async () => {
      const r = await transitionBike(bikeId, to, reason);
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      setTransitionDialog(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {isDeleted ? (
        <div className="bg-destructive/10 text-destructive rounded-md border border-destructive/30 px-3 py-2 text-sm">
          This bike was soft-deleted. It is hidden from the bikes list but
          history remains queryable. Use Restore to bring it back.
        </div>
      ) : null}
      {actionError ? (
        <p className="text-destructive text-sm" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {frameNumber}
            </span>
            {bikeTypeName ? (
              <Badge variant="outline" className="font-normal">
                {bikeTypeName}
              </Badge>
            ) : null}
            <Badge
              variant={BIKE_STATUS_VARIANT[status] ?? "outline"}
            >
              {bikeStatusLabel(status)}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {templateLabel ?? "Bike"}
          </h1>
          {colorName ? (
            <p className="text-muted-foreground text-sm">
              <ColorChip hex={colorHex} label={colorName} />
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!isDeleted && assignAction ? assignAction : null}
          {!isDeleted && nextStatuses.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pending}>
                  Move to <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {nextStatuses.map((to, i) => {
                  const isTerminal = transitionRequiresReason(to);
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
                        {bikeStatusLabel(to)}
                      </DropdownMenuItem>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="More bike actions"
                disabled={pending}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isDeleted ? (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={(e) => {
                    e.preventDefault();
                    runRestore();
                  }}
                >
                  <ArchiveRestore aria-hidden /> Restore bike
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={pending}
                  onSelect={(e) => {
                    e.preventDefault();
                    if (confirmDelete) runDelete();
                    else setConfirmDelete(true);
                  }}
                >
                  <Trash2 aria-hidden />{" "}
                  {confirmDelete ? "Click again to confirm" : "Delete bike"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TransitionReasonDialog
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

function TransitionReasonDialog({
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

  // Reset reason whenever the dialog opens for a fresh transition.
  if (pending && reason !== "" && reason.length === 0) setReason("");

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
            <DialogTitle>
              {pending ? `Mark as ${bikeStatusLabel(pending.to)}` : "Transition"}
            </DialogTitle>
            <DialogDescription>
              This is a terminal state. Add a short reason for the audit trail.
            </DialogDescription>
          </UiDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transition-reason">Reason</Label>
            <Textarea
              id="transition-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. End of service life — frame cracked at the head tube."
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || reason.trim() === ""}
            >
              {isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
