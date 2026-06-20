"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setLocationActive } from "../_actions/manage-locations";

type Props = {
  id: string;
  isActive: boolean;
  isPrimary: boolean;
  movementCount: number;
};

/**
 * Soft-archive toggle for an inventory location, mirroring the colours one.
 * The primary shop location can't be archived (consumption/receipt falls back
 * to it) — the button is disabled with an explanation until a different primary
 * is set in Settings.
 */
export function ArchiveButton({
  id,
  isActive,
  isPrimary,
  movementCount,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const blockedPrimary = isActive && isPrimary;

  function onClick() {
    setError(null);
    start(async () => {
      const r = await setLocationActive(id, !isActive);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/admin/locations");
      router.refresh();
    });
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border border-dashed p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">
            {isActive ? "Archive this location" : "Restore this location"}
          </h3>
          <p className="text-muted-foreground text-xs">
            {blockedPrimary
              ? "This is the primary shop location. Set a different primary in Settings before archiving it."
              : isActive
                ? movementCount > 0
                  ? `${movementCount} movement${movementCount === 1 ? "" : "s"} reference this location. Archiving hides it from new pickers; the ledger keeps its history.`
                  : "Archiving hides this location from new pickers. No movements reference it currently."
                : "Restoring makes this location selectable again in new pickers."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={isActive ? "destructive" : "outline"}
          onClick={onClick}
          disabled={pending || blockedPrimary}
        >
          {isActive ? (
            <>
              <Archive className="size-4" aria-hidden />
              {pending ? "Archiving…" : "Archive"}
            </>
          ) : (
            <>
              <ArchiveRestore className="size-4" aria-hidden />
              {pending ? "Restoring…" : "Restore"}
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
