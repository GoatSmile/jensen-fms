"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, History } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  backfillHistoricalPoRates,
  refreshLatestRates,
} from "../_actions/manage-fx";

export function FxActions() {
  const router = useRouter();
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
          <RefreshCw aria-hidden /> {activeAction === "refresh" ? "Refreshing…" : "Refresh latest rates"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={runBackfill}
          disabled={pending}
        >
          <History aria-hidden />{" "}
          {activeAction === "backfill"
            ? "Backfilling…"
            : "Backfill historical PO line rates"}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {success}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Rates come from{" "}
        <a
          href="https://frankfurter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          frankfurter.app
        </a>{" "}
        (ECB reference rates, same data Danmarks Nationalbank publishes as the
        daily fixing). Free, no API key, history to 1999. Backfill walks every
        non-DKK PO line, looks up the rate for its order date, and updates
        the snapshot — inventory_movements unit cost is recomputed too.
      </p>
    </div>
  );
}
