"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { CallLane, CallReason } from "@/lib/calls/triage";

import { createTicketFromInbound } from "../_actions/create-ticket";
import { runPipeline, setDisposition } from "../_actions/process";

/**
 * The one likely next step for a call, plus its undo. Every action here
 * revalidates the Calls page itself (revalidateInbound), so the row moves to
 * its new group with the response — no refresh on top.
 */
export function CallRowActions({
  id,
  lane,
  reason,
  ticketId,
  ticketHref,
}: {
  id: string;
  lane: CallLane;
  reason: CallReason;
  ticketId: string | null;
  /** Null when the viewer cannot open tickets (a technician). */
  ticketHref: string | null;
}) {
  const t = useTranslations("calls");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? t("actionFailed"));
    });
  }

  let buttons: React.ReactNode = null;
  if (lane === "todo") {
    buttons = (
      <>
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => createTicketFromInbound(id))}>
          {t("createTicket")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => setDisposition(id, "handled"))}
        >
          {t("noActionNeeded")}
        </Button>
      </>
    );
  } else if (lane === "check") {
    buttons =
      reason === "failed" ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => runPipeline(id))}>
          {pending ? t("retrying") : t("retry")}
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link href={`/calls/${id}`}>{reason === "which_customer" ? t("pickCustomer") : t("check")}</Link>
        </Button>
      );
  } else if (lane === "quiet") {
    buttons = (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => setDisposition(id, "needs_action"))}
      >
        {t("needsAction")}
      </Button>
    );
  } else if (ticketId) {
    buttons = ticketHref ? (
      <Button asChild size="sm" variant="ghost">
        <Link href={ticketHref}>{t("openTicket")}</Link>
      </Button>
    ) : null;
  } else {
    buttons = (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => setDisposition(id, "pending"))}
      >
        {t("reopen")}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {buttons}
      {error ? (
        <span className="text-destructive basis-full text-right text-xs" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
