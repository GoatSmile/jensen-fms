"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArchiveRestore,
  ChevronDown,
  ClipboardList,
  MoreHorizontal,
  QrCode,
  Trash2,
  Wrench,
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
   * Gates `planning → building` in the Move-to menu: without an MO there is no
   * way out of `building` (see `validNextStatuses`). The server action enforces
   * this too — this only keeps a dead option out of the menu.
   */
  hasManufacturingOrder: boolean;
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
  hasManufacturingOrder,
  assignAction,
}: Props) {
  const t = useTranslations("bikeDetail");
  const tStatus = useTranslations("bikeStatus");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const [transitionDialog, setTransitionDialog] =
    useState<PendingTransition>(null);

  const nextStatuses = validNextStatuses(status, { hasManufacturingOrder });

  // Same rule loadWOPickables uses: everything except the terminal states. A
  // deleted bike gets nothing either.
  const canTakeNewWork =
    !isDeleted && status !== "retired" && status !== "lost_or_stolen";

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
          {t("deletedBanner")}
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
              {tStatus(status)}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {templateLabel ?? t("fallbackTitle")}
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
                  {t("moveTo")} <ChevronDown aria-hidden />
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
                        {tStatus(to)}
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
                aria-label={t("moreActions")}
                disabled={pending}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/*
                Both target forms already accept ?bike=<id> and honour it — the
                parameter existed with zero callers, so this is the missing
                link, not a new capability. Hidden for terminal statuses to
                match loadWOPickables / the ticket form's own bike list, so the
                menu never links to a form that would refuse this bike.
              */}
              {canTakeNewWork ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/maintenance/work-orders/new?bike=${bikeId}`}>
                      <Wrench aria-hidden /> {t("newWorkOrder")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/maintenance/tickets/new?bike=${bikeId}`}>
                      <ClipboardList aria-hidden /> {t("newTicket")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={`/qr/${bikeId}`}>
                  <QrCode aria-hidden /> {t("qrSticker")}
                </Link>
              </DropdownMenuItem>
              {isDeleted ? (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={(e) => {
                    e.preventDefault();
                    runRestore();
                  }}
                >
                  <ArchiveRestore aria-hidden /> {t("restore")}
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
                  {confirmDelete ? tCommon("confirmRepeat") : t("deleteBike")}
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
  const t = useTranslations("bikeDetail");
  const tStatus = useTranslations("bikeStatus");
  const tCommon = useTranslations("common");
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
              {pending
                ? t("markAs", { status: tStatus(pending.to) })
                : t("transition")}
            </DialogTitle>
            <DialogDescription>{t("terminalReasonDesc")}</DialogDescription>
          </UiDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transition-reason">{t("reason")}</Label>
            <Textarea
              id="transition-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
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
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || reason.trim() === ""}
            >
              {isPending ? tCommon("saving") : t("confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
