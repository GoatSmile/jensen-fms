"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setCategoryActive } from "../_actions/manage-categories";

type Props = {
  id: string;
  isActive: boolean;
  partCount: number;
  childCount: number;
};

export function ArchiveButton({ id, isActive, partCount, childCount }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onClick() {
    setError(null);
    start(async () => {
      const r = await setCategoryActive(id, !isActive);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/admin/categories");
      router.refresh();
    });
  }

  const hints: string[] = [];
  if (partCount > 0)
    hints.push(
      `${partCount} part${partCount === 1 ? "" : "s"} reference this category`,
    );
  if (childCount > 0)
    hints.push(
      `${childCount} sub-categor${childCount === 1 ? "y" : "ies"} stay${childCount === 1 ? "s" : ""} visible`,
    );

  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border border-dashed p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">
            {isActive ? "Archive this category" : "Restore this category"}
          </h3>
          <p className="text-muted-foreground text-xs">
            {isActive
              ? `Archiving hides this category from new-part pickers and the parts filter. Existing parts keep their classification.${hints.length ? ` (${hints.join("; ")}.)` : ""}`
              : "Restoring makes this category selectable again for new parts."}
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
