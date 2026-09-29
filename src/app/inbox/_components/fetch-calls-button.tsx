"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PhoneIncoming } from "lucide-react";

import { Button } from "@/components/ui/button";

import { importCallsNow } from "../_actions/import-calls";

/**
 * Pull recorded calls from the shop's phone system now instead of waiting
 * for the five-minute schedule. The action revalidates /inbox, so new rows
 * arrive with its response — no refresh on top.
 */
export function FetchCallsButton() {
  const t = useTranslations("inbox");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    setMessage(null);
    start(async () => {
      const r = await importCallsNow();
      setMessage(
        r.ok
          ? {
              ok: true,
              text:
                r.imported > 0
                  ? t("fetchCallsImported", { count: r.imported })
                  : t("fetchCallsNothingNew"),
            }
          : { ok: false, text: r.error },
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
        <PhoneIncoming className="size-4" aria-hidden />
        {pending ? t("fetchCallsRunning") : t("fetchCallsNow")}
      </Button>
      {message ? (
        <p
          role="status"
          className={message.ok ? "text-ink-2 text-sm" : "text-destructive text-sm"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
