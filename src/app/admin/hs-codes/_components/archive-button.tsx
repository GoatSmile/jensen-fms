"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { setHsCodeActive } from "../_actions/manage-hs-codes";

type Props = {
  id: string;
  isActive: boolean;
  partCount: number;
};

export function ArchiveButton({ id, isActive, partCount }: Props) {
  const router = useRouter();
  const t = useTranslations("adminHsCodes");
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
            {isActive ? t("archiveTitle") : t("restoreTitle")}
          </h3>
          <p className="text-muted-foreground text-xs">
            {isActive
              ? partCount > 0
                ? t("archiveWithUsage", { count: partCount })
                : t("archiveNoUsage")
              : t("restoreHint")}
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
              {pending ? t("archiving") : t("archive")}
            </>
          ) : (
            <>
              <ArchiveRestore className="size-4" aria-hidden />
              {pending ? t("restoring") : t("restore")}
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
