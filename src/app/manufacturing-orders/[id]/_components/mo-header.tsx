"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, Printer } from "lucide-react";

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
  MO_STATUS_VARIANT,
  moStatusLabel,
  moTransitionRequiresReason,
  validNextMOStatuses,
  type MOStatus,
} from "@/lib/mo/status";

import { transitionMO } from "../_actions/transition-mo";

type PendingTransition = { to: MOStatus } | null;

type Props = {
  moId: string;
  moNumber: string;
  status: MOStatus;
  /** All target bikes built but the MO is still in progress — nudge completion. */
  readyToComplete: boolean;
  templateLabel: string | null;
  templateId: string | null;
  templateVersion: number | null;
  bikeTypeName: string | null;
  colorName: string | null;
  colorHex: string | null;
};

export function MOHeader({
  moId,
  moNumber,
  status,
  readyToComplete,
  templateLabel,
  templateId,
  templateVersion,
  bikeTypeName,
  colorName,
  colorHex,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] = useState<PendingTransition>(null);

  const nextStatuses = validNextMOStatuses(status);

  function startTransition(to: MOStatus) {
    if (moTransitionRequiresReason(to)) {
      setTransitionDialog({ to });
    } else {
      runTransition(to, null);
    }
  }

  function runTransition(to: MOStatus, reason: string | null) {
    setError(null);
    start(async () => {
      const r = await transitionMO(moId, to, reason);
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
      {readyToComplete ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            Every bike is built. Complete the MO when the batch is done.
          </p>
          <Button
            size="sm"
            onClick={() => runTransition("completed", null)}
            disabled={pending}
          >
            <CheckCircle2 aria-hidden /> Complete MO
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {moNumber}
            </span>
            <Badge variant={MO_STATUS_VARIANT[status] ?? "outline"}>
              {moStatusLabel(status)}
            </Badge>
            {bikeTypeName ? (
              <Badge variant="outline" className="font-normal">
                {bikeTypeName}
              </Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {templateLabel ?? (
              <span className="italic">One-off manufacturing order</span>
            )}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {templateLabel && templateId ? (
              <span>
                Built against{" "}
                <a
                  href={`/bike-templates/${templateId}`}
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  template{templateVersion != null ? ` v${templateVersion}` : ""}
                </a>
              </span>
            ) : null}
            {colorName ? (
              <ColorChip hex={colorHex} label={colorName} />
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link
              href={`/manufacturing-orders/${moId}/print`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer aria-hidden /> Print parts list
            </Link>
          </Button>
          {nextStatuses.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pending}>
                  Move to <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {nextStatuses.map((to, i) => {
                  const isTerminal = moTransitionRequiresReason(to);
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
                        {moStatusLabel(to)}
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
            <DialogTitle>
              {pending ? `Cancel MO?` : "Confirm"}
            </DialogTitle>
            <DialogDescription>
              The MO will be cancelled and the reason will be appended to its
              notes for the audit trail. Bikes already attached to this MO are
              not changed.
            </DialogDescription>
          </UiDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mo-cancel-reason">Reason</Label>
            <Textarea
              id="mo-cancel-reason"
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
              {isPending ? "Cancelling…" : "Cancel MO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
