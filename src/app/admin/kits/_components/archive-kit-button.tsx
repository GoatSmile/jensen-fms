"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ArchivePanel } from "@/components/archive-panel";

import { setKitActive } from "../_actions/manage-kits";

/**
 * Unlike the other six, this one refreshes in place rather than routing back to
 * the list — the kit detail page is where the sticker sheet lives, so staying
 * put is the useful behaviour.
 */
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
  const t = useTranslations("adminKits");

  return (
    <ArchivePanel
      namespace="adminKits"
      isActive={isActive}
      description={
        isActive
          ? t("archiveDescription", { count: partCount })
          : t("restoreDescription")
      }
      onToggle={async () => {
        const r = await setKitActive(id, !isActive);
        if (!r.ok) return r.error;
        router.refresh();
        return null;
      }}
    />
  );
}
