"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";

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
  serviceOrderStatusLabel,
  serviceOrderTransitionRequiresReason,
  validNextServiceOrderStatuses,
  type ServiceOrderStatus,
} from "@/lib/services/status";
import { PAINT_SUPPLIER_NOUN } from "@/lib/services/vocab";

import { transitionServiceOrderStatus } from "../_actions/transition-status";

type PendingTransition = { to: ServiceOrderStatus } | null;

type Props = {
  serviceOrderId: string;
  orderNumber: string;
  status: ServiceOrderStatus;
  supplierName: string | null;
  colorName: string | null;
  colorHex: string | null;
  colorFinish: string | null;
};

export function PaintOrderHeader({
  serviceOrderId,
  orderNumber,
  status,
  supplierName,
  colorName,
  colorHex,
  colorFinish,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] =
    useState<PendingTransition>(null);

  const nextStatuses = validNextServiceOrderStatuses(status);

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
              {orderNumber}
            </span>
            <Badge variant={SERVICE_ORDER_STATUS_VARIANT[status] ?? "outline"}>
              {serviceOrderStatusLabel(status, PAINT_SUPPLIER_NOUN)}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {supplierName ?? "Paint order"}
          </h1>
          {colorName ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <ColorChip hex={colorHex} label={colorName} />
              {colorFinish ? (
                <span className="text-xs">{colorFinish}</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {nextStatuses.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pending}>
                  Move to <ChevronDown aria-hidden />
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
                        {serviceOrderStatusLabel(to, PAINT_SUPPLIER_NOUN)}
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
            <DialogTitle>Cancel paint order?</DialogTitle>
            <DialogDescription>
              The order will be cancelled and the reason will be appended to
              its notes for the audit trail. Bikes attached to this order are
              not changed.
            </DialogDescription>
          </UiDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-cancel-reason">Reason</Label>
            <Textarea
              id="paint-cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Painter shut down for the holiday — re-batched next week."
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
              {isPending ? "Cancelling…" : "Cancel paint order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
