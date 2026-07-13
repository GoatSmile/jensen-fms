"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("adminKits");
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
            {isActive ? t("archiveTitle") : t("restoreTitle")}
          </h3>
          <p className="text-muted-foreground text-xs">
            {isActive
              ? t("archiveDescription", { count: partCount })
              : t("restoreDescription")}
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
              {pending ? t("archiving") : t("archive")}
            </>
          ) : (
            <>
              <ArchiveRestore className="size-4" aria-hidden />{" "}
              {pending ? t("restoring") : t("restore")}
            </>
          )}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
