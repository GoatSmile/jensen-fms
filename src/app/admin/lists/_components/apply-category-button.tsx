"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { applyPainterTypeToCategory } from "../_actions/manage-service-part-types";

/**
 * Per-row "fill the blanks in my category" on the service part types list.
 *
 * The mapping is a generator, so it needs a trigger: setting *Frames → Frame*
 * changes nothing about the frames already on file. This is the whole payoff of
 * the mapping — one click instead of two hundred edits — so it says up front
 * how many parts it will touch, and afterwards how many it did.
 */
export function ApplyCategoryButton({
  typeId,
  undecided,
}: {
  typeId: string;
  undecided: number;
}) {
  const router = useRouter();
  const t = useTranslations("adminLists");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={pending || undecided === 0}
        onClick={() => {
          setError(null);
          setDone(null);
          start(async () => {
            const r = await applyPainterTypeToCategory(typeId);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setDone(r.updated);
            router.refresh();
          });
        }}
      >
        {undecided === 0
          ? t("applyCategoryNothing")
          : t("applyCategory", { count: undecided })}
      </Button>
      {done != null ? (
        <span className="text-good text-xs">
          {t("applyCategoryDone", { count: done })}
        </span>
      ) : null}
      {error ? (
        <span className="text-destructive text-xs" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
