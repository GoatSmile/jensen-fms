"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, TicketPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { createTicketFromInbound } from "../../_actions/create-ticket";

type Props = {
  messageId: string;
  ticketId: string | null;
  ticketNumber: string | null;
  canCreate: boolean;
  shadowMode: boolean;
};

/**
 * Shadow-mode ticketing action (Slice E). Turns the reviewed message into a
 * draft maintenance ticket, or links to the one already created. Human-in-
 * the-loop: nothing auto-creates in v1.
 */
export function TicketAction({
  messageId,
  ticketId,
  ticketNumber,
  canCreate,
  shadowMode,
}: Props) {
  const t = useTranslations("inbox");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onCreate() {
    setError(null);
    start(async () => {
      const r = await createTicketFromInbound(messageId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/maintenance/tickets/${r.ticketId}`);
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border p-4">
      <h2 className="text-sm font-semibold">{t("actionTitle")}</h2>
      {ticketId ? (
        <p className="inline-flex items-center gap-2 text-sm">
          <Check
            className="size-4 text-emerald-600 dark:text-emerald-400"
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
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {shadowMode ? t("shadowCreateHint") : t("createHint")}
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              onClick={onCreate}
              disabled={pending || !canCreate}
            >
              <TicketPlus aria-hidden />
              {pending ? t("creatingTicket") : t("createTicket")}
            </Button>
          </div>
          {!canCreate ? (
            <p className="text-muted-foreground text-xs">
              {t("createNeedsMatch")}
            </p>
          ) : null}
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
