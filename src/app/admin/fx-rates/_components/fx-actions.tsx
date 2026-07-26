"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw, History } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  backfillHistoricalPoRates,
  refreshLatestRates,
} from "../_actions/manage-fx";

export function FxActions() {
  const router = useRouter();
  const t = useTranslations("adminFx");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [activeAction, setActiveAction] = useState<
    "refresh" | "backfill" | null
  >(null);

  function runRefresh() {
    setError(null);
    setSuccess(null);
    setActiveAction("refresh");
    start(async () => {
      const r = await refreshLatestRates();
      if (!r.ok) setError(r.error);
      else {
        setSuccess(r.message);
        router.refresh();
      }
      setActiveAction(null);
    });
  }

  function runBackfill() {
    setError(null);
    setSuccess(null);
    setActiveAction("backfill");
    start(async () => {
      const r = await backfillHistoricalPoRates();
      if (!r.ok) setError(r.error);
      else {
        setSuccess(r.message);
        router.refresh();
      }
      setActiveAction(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={runRefresh}
          disabled={pending}
        >
          <RefreshCw aria-hidden />{" "}
          {activeAction === "refresh" ? t("refreshing") : t("refresh")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={runBackfill}
          disabled={pending}
        >
          <History aria-hidden />{" "}
          {activeAction === "backfill" ? t("backfilling") : t("backfill")}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-good" role="status">
          {success}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {t.rich("attribution", {
          link: (chunks) => (
            <a
              href="https://frankfurter.app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
