"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setKitActive } from "../_actions/manage-kits";

export function ArchiveKitButton({
  id,
  isActive,
  partCount,
}: {
  id: string;
  isActive: boolean;
  partCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onClick() {
    setError(null);
    start(async () => {
      const r = await setKitActive(id, !isActive);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border border-dashed p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">
            {isActive ? "Archive this kit" : "Restore this kit"}
          </h3>
          <p className="text-muted-foreground text-xs">
            {isActive
              ? `Archiving hides the kit from pickers, pick lists, and the parts filter. The ${partCount} labelled part${partCount === 1 ? "" : "s"} keep the label (greyed) until removed.`
              : "Restoring puts the kit back in pickers and pick lists."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={isActive ? "destructive" : "outline"}
          onClick={onClick}
          disabled={pending}
        >
          {isActive ? (
            <>
              <Archive className="size-4" aria-hidden />{" "}
              {pending ? "Archiving…" : "Archive"}
            </>
          ) : (
            <>
              <ArchiveRestore className="size-4" aria-hidden />{" "}
              {pending ? "Restoring…" : "Restore"}
            </>
          )}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
