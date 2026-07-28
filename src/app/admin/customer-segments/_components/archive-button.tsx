"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ArchivePanel } from "@/components/archive-panel";

import { setCustomerSegmentActive } from "../_actions/manage-customer-segments";

type Props = {
  id: string;
  isActive: boolean;
  usageCount: number;
};

export function ArchiveButton({ id, isActive, usageCount }: Props) {
  const router = useRouter();
  const t = useTranslations("adminSegments");

  return (
    <ArchivePanel
      namespace="adminSegments"
      isActive={isActive}
      description={
        isActive
          ? usageCount > 0
            ? t("archiveDescriptionUsed", { count: usageCount })
            : t("archiveDescriptionNone")
          : t("restoreDescription")
      }
      onToggle={async () => {
        const r = await setCustomerSegmentActive(id, !isActive);
        if (!r.ok) return r.error;
        router.push("/admin/customer-segments");
        router.refresh();
        return null;
      }}
    />
  );
}
