"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronDown, Paintbrush, Printer } from "lucide-react";

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
  /** The SO this MO builds for — null for a stock build. */
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  /** completed / cancelled: no frames go anywhere from here. */
  closed: boolean;
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
  salesOrderId,
  salesOrderNumber,
  closed,
}: Props) {
  const t = useTranslations("moDetail");
  const tStatus = useTranslations("moStatus");
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-good-wash px-4 py-2.5">
          <p className="text-sm text-good">
            {t("readyBanner")}
          </p>
          <Button
            size="sm"
            onClick={() => runTransition("completed", null)}
            disabled={pending}
          >
            <CheckCircle2 aria-hidden /> {t("completeMo")}
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
              {tStatus.has(status) ? tStatus(status) : status}
            </Badge>
            {bikeTypeName ? (
              <Badge variant="outline" className="font-normal">
                {bikeTypeName}
              </Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {templateLabel ?? (
              <span className="italic">{t("oneOffTitle")}</span>
            )}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {templateLabel && templateId ? (
              <span>
                {t.rich("builtAgainst", {
                  version:
                    templateVersion != null ? ` v${templateVersion}` : "",
                  link: (chunks) => (
                    <a
                      href={`/bike-templates/${templateId}`}
                      className="hover:text-foreground underline-offset-4 hover:underline"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </span>
            ) : null}
            {colorName ? (
              <ColorChip hex={colorHex} label={colorName} />
            ) : null}
            {salesOrderId && salesOrderNumber ? (
              <Link
                href={`/sales-orders/${salesOrderId}`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                {t("linkedSalesOrder")}{" "}
                <span className="font-mono">{salesOrderNumber}</span>
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* The next step after spawning an MO for a customer order: the
              frames go to the painter, and that is created from the SO so the
              paint order links back to it (D3). Stock builds attach bikes from
              the paint order's own picker instead. */}
          {salesOrderId && !closed ? (
            <Button variant="outline" asChild>
              <Link href={`/sales-orders/${salesOrderId}/paint/new`}>
                <Paintbrush aria-hidden /> {t("sendToPainter")}
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link
              href={`/manufacturing-orders/${moId}/print`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer aria-hidden /> {t("printPartsList")}
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
  const t = useTranslations("moDetail");
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
              {pending ? t("cancelTitle") : t("confirm")}
            </DialogTitle>
            <DialogDescription>{t("cancelDesc")}</DialogDescription>
          </UiDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mo-cancel-reason">{t("reason")}</Label>
            <Textarea
              id="mo-cancel-reason"
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
              {isPending ? t("cancelling") : t("cancelMo")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
