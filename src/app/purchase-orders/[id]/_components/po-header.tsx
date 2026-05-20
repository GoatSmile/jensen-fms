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
  PO_STATUS_VARIANT,
  poStatusLabel,
  poTransitionRequiresReason,
  validNextPOStatuses,
  type PurchaseOrderStatus,
} from "@/lib/po/status";

import { transitionPO } from "../../_actions/transition-po";

type PendingTransition = { to: PurchaseOrderStatus } | null;

type Props = {
  poId: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierName: string | null;
  supplierId: string | null;
};

export function POHeader({
  poId,
  poNumber,
  status,
  supplierName,
  supplierId,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] =
    useState<PendingTransition>(null);

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
              {poStatusLabel(status)}
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
        </div>
        <div className="flex gap-2">
          {status === "draft" ? (
            <Button variant="outline" asChild>
              <Link href={`/purchase-orders/${poId}/edit`}>
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
                        {poStatusLabel(to)}
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
            <DialogTitle>Cancel PO?</DialogTitle>
            <DialogDescription>
              The PO will be cancelled and the reason will be appended to its
              notes for the audit trail. Already-received stock movements are
              unaffected.
            </DialogDescription>
          </UiDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-cancel-reason">Reason</Label>
            <Textarea
              id="po-cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Supplier confirmed back-order pushes delivery past the project deadline."
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
              {isPending ? "Cancelling…" : "Cancel PO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
