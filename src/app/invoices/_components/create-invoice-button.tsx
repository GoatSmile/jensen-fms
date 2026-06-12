"use client";

import { useState, useTransition } from "react";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

import { createInvoiceFromWO } from "../_actions/create-from-wo";

type Props = {
  woId: string;
  /** Disable with a reason, e.g. the bike has no owner organization. */
  disabledReason?: string | null;
};

/**
 * Per-row "Create invoice" on the uninvoiced-WOs table. The action
 * redirects to the new draft on success, so the only local state is the
 * pending spinner and an error line.
 */
export function CreateInvoiceButton({ woId, disabledReason }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function onCreate() {
    setError(null);
    start(async () => {
      const r = await createInvoiceFromWO(woId);
      // Success redirects (throws) — only error results land here.
      if (r && !r.ok) setError(r.error);
    });
  }

  if (disabledReason) {
    return (
      <span className="text-muted-foreground text-xs italic">
        {disabledReason}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" onClick={onCreate} disabled={isPending}>
        <FileText aria-hidden />
        {isPending ? "Creating…" : "Create invoice"}
      </Button>
      {error ? (
        <p className="text-destructive max-w-[260px] text-right text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
