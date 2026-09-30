"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, CheckCheck, TicketPlus, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

import { createTicketFromInbound } from "../../_actions/create-ticket";
import { planFromInquiry } from "../../_actions/command";
import { setDisposition } from "../../_actions/process";

type Props = {
  messageId: string;
  /** Extracted intent — routes the primary action. */
  intent: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  disposition: string;
  /** Whether the message is matched (has an extraction to act on). */
  canAct: boolean;
  shadowMode: boolean;
  /** A command plan already exists — the panel below owns the lead from here. */
  hasPlan: boolean;
};

/**
 * Intent-routed review action (layer 4).
 *
 * New calls arrive with SUGGESTED actions already drafted (the import job's
 * planner pass): an offer for bikes they want, a ticket for a repair. When a
 * plan exists this box only points at it and offers "handled". Without one —
 * an older call, or one the planner could not read — it offers to draft the
 * suggestions now, and a `repair_request` keeps its direct "Create ticket".
 *
 * "Create a ticket instead" stays available on every non-repair intent,
 * because the model's intent can be wrong and the reviewer decides. Nothing is
 * written until an action is applied.
 */
export function RoutedAction({
  messageId,
  intent,
  ticketId,
  ticketNumber,
  disposition,
  canAct,
  shadowMode,
  hasPlan,
}: Props) {
  const t = useTranslations("inbox");
  const tIntent = useTranslations("inboundIntent");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function createTicket() {
    setError(null);
    start(async () => {
      const r = await createTicketFromInbound(messageId);
      if (!r.ok) return setError(r.error);
      router.push(`/maintenance/tickets/${r.ticketId}`);
    });
  }

  function dispose(d: "handled" | "pending") {
    setError(null);
    start(async () => {
      const r = await setDisposition(messageId, d);
      if (!r.ok) return setError(r.error);
    });
  }

  function draftFromCall() {
    setError(null);
    start(async () => {
      const r = await planFromInquiry(messageId);
      if (!r.ok) return setError(r.error);
    });
  }

  const intentLabel = intent && tIntent.has(intent) ? tIntent(intent) : null;
  const isRepair = intent === "repair_request";
  const isLead = intent === "order_inquiry";

  return (
    <Panel
      title={t("actionTitle")}
      action={
        intentLabel ? (
          <span className="text-ink-2 text-xs">
            {t("intentLabel")}: {intentLabel}
          </span>
        ) : null
      }
      contentClassName="flex flex-col gap-2"
    >
      {ticketId ? (
        <p className="inline-flex items-center gap-2 text-sm">
          <Check
            className="size-4 text-good"
            aria-hidden
          />
          {t("ticketCreatedLabel")}{" "}
          <Link
            href={`/maintenance/tickets/${ticketId}`}
            className="font-medium underline"
          >
            {ticketNumber ?? t("viewTicket")}
          </Link>
        </p>
      ) : disposition === "handled" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex items-center gap-2 text-sm">
            <CheckCheck
              className="size-4 text-good"
              aria-hidden
            />
            {t("handledLabel")}
          </p>
          <button
            type="button"
            onClick={() => dispose("pending")}
            disabled={pending}
            className="text-muted-foreground text-xs underline"
          >
            {t("reopen")}
          </button>
        </div>
      ) : !canAct ? (
        <p className="text-muted-foreground text-xs">{t("createNeedsMatch")}</p>
      ) : hasPlan ? (
        <>
          {/* The suggestions panel below owns the next step now. */}
          <p className="text-muted-foreground text-xs">{t("planBelowHint")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="outline" onClick={() => dispose("handled")} disabled={pending}>
              <CheckCheck aria-hidden />
              {t("markHandled")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {isRepair
              ? shadowMode
                ? t("shadowCreateHint")
                : t("createHint")
              : isLead
                ? t("leadDraftHint")
                : t("otherHint")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {/* New calls get suggestions by themselves; this is for older ones
                and for a call the planner could not read. Nothing is written
                until a suggestion is applied. */}
            {isRepair ? (
              <Button type="button" size="sm" onClick={createTicket} disabled={pending}>
                <TicketPlus aria-hidden />
                {pending ? t("creatingTicket") : t("createTicket")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={isRepair ? "outline" : "default"}
              onClick={draftFromCall}
              disabled={pending}
            >
              <Wand2 aria-hidden />
              {pending ? t("leadDrafting") : t("leadDraft")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => dispose("handled")} disabled={pending}>
              <CheckCheck aria-hidden />
              {t("markHandled")}
            </Button>
            {!isRepair ? (
              <button
                type="button"
                onClick={createTicket}
                disabled={pending}
                className="text-muted-foreground text-xs underline"
              >
                {t("createTicketInstead")}
              </button>
            ) : null}
          </div>
        </>
      )}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
