"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setCustomerSegmentActive } from "../_actions/manage-customer-segments";

type Props = {
  id: string;
  isActive: boolean;
  usageCount: number;
};

export function ArchiveButton({ id, isActive, usageCount }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onClick() {
    setError(null);
    start(async () => {
      const r = await setCustomerSegmentActive(id, !isActive);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/admin/customer-segments");
      router.refresh();
    });
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border border-dashed p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">
            {isActive ? "Archive this segment" : "Restore this segment"}
          </h3>
          <p className="text-muted-foreground text-xs">
            {isActive
              ? usageCount > 0
                ? `${usageCount} organisation${usageCount === 1 ? "" : "s"} use this segment. Archiving hides it from new pickers; existing organisations keep their reference.`
                : "Archiving hides this segment from new pickers. No organisations reference it currently."
              : "Restoring makes this segment selectable again in new pickers."}
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
