"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setDisposition } from "../../_actions/process";

type Props = {
  messageId: string;
  disposition: string;
  /** Whether the row is currently folded as spam (server-computed). */
  isSpam: boolean;
  /** The stored spam signals, for the "why" list. */
  signals: string[];
};

/**
 * Triage control (layer 5). When a message is parked as suspected spam it
 * shows why + a one-click "Not spam" to send it back to the queue; otherwise
 * a quiet "Mark as spam". Fully reversible — nothing is destructive.
 */
export function DispositionAction({
  messageId,
  disposition,
  isSpam,
  signals,
}: Props) {
  const t = useTranslations("inbox");
  const tSig = useTranslations("inboundSpamSignal");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(d: "spam" | "not_spam") {
    setError(null);
    start(async () => {
      const r = await setDisposition(messageId, d);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  if (isSpam) {
    const confirmed = disposition === "spam";
    return (
      <section className="flex flex-col gap-2 rounded-md border bg-money-wash p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-alert">
          <ShieldAlert className="size-4" aria-hidden />
          {confirmed ? t("spamConfirmedTitle") : t("spamSuspectedTitle")}
        </div>
        {signals.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            {signals
              .map((s) => (tSig.has(s) ? tSig(s) : s))
              .join(" · ")}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => set("not_spam")}
            disabled={pending}
          >
            <ShieldCheck aria-hidden />
            {t("notSpam")}
          </Button>
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => set("spam")}
        disabled={pending}
      >
        <ShieldAlert aria-hidden />
        {t("markSpam")}
      </Button>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
