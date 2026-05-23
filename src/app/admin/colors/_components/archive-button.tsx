"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setColorActive } from "../_actions/manage-colors";

type Props = {
  id: string;
  isActive: boolean;
  usageCount: number;
};

/**
 * Soft-archive toggle for a colour. Lives on /admin/colors/[id] as a
 * footer action so admins find archive/restore in the same place edit
 * happens — the harmonized "everything for this item, on this page"
 * pattern.
 *
 * Archive is reversible (it just flips is_active) so no confirmation
 * modal — the warning text + usage count is enough friction. After
 * toggling we route back to the list so the row re-orders correctly
 * (active rows first).
 */
export function ArchiveButton({ id, isActive, usageCount }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onClick() {
    setError(null);
    start(async () => {
      const r = await setColorActive(id, !isActive);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/admin/colors");
      router.refresh();
    });
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border border-dashed p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">
            {isActive ? "Archive this colour" : "Restore this colour"}
          </h3>
          <p className="text-muted-foreground text-xs">
            {isActive
              ? usageCount > 0
                ? `${usageCount} bike${usageCount === 1 ? "" : "s"} / MO${usageCount === 1 ? "" : "s"} reference this colour. Archiving hides it from new pickers; existing records keep their reference.`
                : "Archiving hides this colour from new bike + MO pickers. No records reference it currently."
              : "Restoring makes this colour selectable again in new pickers."}
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
