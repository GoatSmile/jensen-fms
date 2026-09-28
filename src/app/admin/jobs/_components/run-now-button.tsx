"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";

import { runJobNow } from "../_actions/run-job";

/** Two taps: arm, then confirm — a job does real work (mail, deletes). */
export function RunNowButton({ jobKey }: { jobKey: string }) {
  const t = useTranslations("adminJobs");
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      {armed ? (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setArmed(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await runJobNow(jobKey);
                setArmed(false);
                setMessage(r.ok ? { text: r.summary, ok: true } : { text: r.error, ok: false });
              })
            }
          >
            {pending ? t("running") : t("confirmRun")}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setArmed(true)}>
          <Play aria-hidden /> {t("runNow")}
        </Button>
      )}
      {message ? (
        <p className={`text-xs ${message.ok ? "text-good" : "text-alert"}`} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
