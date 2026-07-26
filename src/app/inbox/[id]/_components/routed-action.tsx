"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, CheckCheck, TicketPlus, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";

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
 * A `repair_request` drafts a maintenance ticket. An `order_inquiry` is a
 * sales lead, and its primary action is to DRAFT from the call (P2): it hands
 * the call to the VC-1 command agent, whose plan of proposed draft actions is
 * reviewed in the CommandPlanPanel below. Before P2 this branch could only
 * "log as handled", which silently lost the most valuable calls the shop
 * receives. Anything else keeps the plain handled/not-handled disposition.
 *
 * "Create a ticket instead" stays available on every non-repair intent,
 * because the model's intent can be wrong and the reviewer decides. Nothing
 * auto-creates, and nothing is written until an action is applied.
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
      router.refresh();
    });
  }

  function draftFromCall() {
    setError(null);
    start(async () => {
      const r = await planFromInquiry(messageId);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  const intentLabel = intent && tIntent.has(intent) ? tIntent(intent) : null;
  const isRepair = intent === "repair_request";
  const isLead = intent === "order_inquiry";

  return (
    <section className="flex flex-col gap-2 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("actionTitle")}</h2>
        {intentLabel ? (
          <span className="text-muted-foreground text-xs">
            {t("intentLabel")}: {intentLabel}
          </span>
        ) : null}
      </div>

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
      ) : isRepair ? (
        <>
          <p className="text-muted-foreground text-xs">
            {shadowMode ? t("shadowCreateHint") : t("createHint")}
          </p>
          <div>
            <Button type="button" size="sm" onClick={createTicket} disabled={pending}>
              <TicketPlus aria-hidden />
              {pending ? t("creatingTicket") : t("createTicket")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {isLead && !hasPlan
              ? t("leadDraftHint")
              : intent === "order_inquiry"
                ? t("leadHint")
                : t("otherHint")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {/* A sales enquiry's primary action is to DRAFT, not to dismiss —
                the plan lands in the panel below for review before anything
                is written. Marking handled stays available but demoted. */}
            {isLead && !hasPlan ? (
              <Button type="button" size="sm" onClick={draftFromCall} disabled={pending}>
                <Wand2 aria-hidden />
                {pending ? t("leadDrafting") : t("leadDraft")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={isLead && !hasPlan ? "outline" : "default"}
              onClick={() => dispose("handled")}
              disabled={pending}
            >
              <CheckCheck aria-hidden />
              {t("markHandled")}
            </Button>
            <button
              type="button"
              onClick={createTicket}
              disabled={pending}
              className="text-muted-foreground text-xs underline"
            >
              {t("createTicketInstead")}
            </button>
          </div>
        </>
      )}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
