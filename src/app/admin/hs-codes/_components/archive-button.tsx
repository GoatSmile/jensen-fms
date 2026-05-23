"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setHsCodeActive } from "../_actions/manage-hs-codes";

type Props = {
  id: string;
  isActive: boolean;
  partCount: number;
};

export function ArchiveButton({ id, isActive, partCount }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onClick() {
    setError(null);
    start(async () => {
      const r = await setHsCodeActive(id, !isActive);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/admin/hs-codes");
      router.refresh();
    });
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border border-dashed p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">
            {isActive ? "Archive this HS code" : "Restore this HS code"}
          </h3>
          <p className="text-muted-foreground text-xs">
            {isActive
              ? partCount > 0
                ? `${partCount} part${partCount === 1 ? "" : "s"} reference this code. Archiving hides it from new part pickers; existing PO lines keep their snapshotted tariff so nothing downstream breaks.`
                : "Archiving hides this code from new part pickers. No parts reference it currently."
              : "Restoring makes this code selectable again in new parts."}
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
