"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Zap } from "lucide-react";

import { Panel } from "@/components/ui/panel";

import { setPersonAutoApply } from "../_actions/manage-people";

/**
 * *Act right away* for one person's spoken notes (plan-inbox-notes.md,
 * slice 4). One switch, saved as it is flipped, with what it does in words —
 * it acts in that person's name, so whoever turns it on should know what for.
 */
export function PersonAutoApplyCard({ personId, initial }: { personId: string; initial: boolean }) {
  const t = useTranslations("adminPeople");
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flip(next: boolean) {
    setError(null);
    setOn(next);
    start(async () => {
      const r = await setPersonAutoApply(personId, next);
      if (!r.ok) {
        setOn(!next);
        setError(r.error);
      }
    });
  }

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Zap className="size-3.5" aria-hidden />
          {t("autoApplyTitle")}
        </span>
      }
      description={t("autoApplyDesc")}
    >
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4"
          checked={on}
          disabled={pending}
          onChange={(e) => flip(e.target.checked)}
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{t("autoApplyLabel")}</span>
          <span className="text-ink-2 text-xs">{t("autoApplyHint")}</span>
        </span>
      </label>
      {error ? (
        <p className="text-destructive mt-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
