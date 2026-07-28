"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ArchivePanel } from "@/components/archive-panel";

import { setColorActive } from "../_actions/manage-colors";

type Props = {
  id: string;
  isActive: boolean;
  usageCount: number;
};

/**
 * Soft-archive toggle for a colour. Lives on /admin/colors/[id] as a footer
 * action so admins find archive/restore in the same place edit happens — the
 * harmonized "everything for this item, on this page" pattern.
 *
 * Archive is reversible (it just flips is_active) so no confirmation modal —
 * the warning text + usage count is enough friction. After toggling we route
 * back to the list so the row re-orders correctly (active rows first).
 */
export function ArchiveButton({ id, isActive, usageCount }: Props) {
  const router = useRouter();
  const t = useTranslations("adminColors");

  return (
    <ArchivePanel
      namespace="adminColors"
      isActive={isActive}
      description={
        isActive
          ? usageCount > 0
            ? t("archiveWithUsage", { count: usageCount })
            : t("archiveNoUsage")
          : t("restoreHint")
      }
      onToggle={async () => {
        const r = await setColorActive(id, !isActive);
        if (!r.ok) return r.error;
        router.push("/admin/colors");
        router.refresh();
        return null;
      }}
    />
  );
}
