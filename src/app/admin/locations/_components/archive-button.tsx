"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ArchivePanel } from "@/components/archive-panel";

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
 * is set at /admin/locations.
 */
export function ArchiveButton({
  id,
  isActive,
  isPrimary,
  movementCount,
}: Props) {
  const router = useRouter();
  const t = useTranslations("adminLocations");

  const blockedPrimary = isActive && isPrimary;

  return (
    <ArchivePanel
      namespace="adminLocations"
      isActive={isActive}
      blocked={blockedPrimary}
      description={
        blockedPrimary
          ? t("blockedPrimaryDesc")
          : isActive
            ? movementCount > 0
              ? t("archiveWithMovements", { count: movementCount })
              : t("archiveNoMovements")
            : t("restoreDesc")
      }
      onToggle={async () => {
        const r = await setLocationActive(id, !isActive);
        if (!r.ok) return r.error;
        router.push("/admin/locations");
        router.refresh();
        return null;
      }}
    />
  );
}
