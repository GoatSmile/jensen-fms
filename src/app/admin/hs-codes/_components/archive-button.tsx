"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ArchivePanel } from "@/components/archive-panel";

import { setHsCodeActive } from "../_actions/manage-hs-codes";

type Props = {
  id: string;
  isActive: boolean;
  partCount: number;
};

export function ArchiveButton({ id, isActive, partCount }: Props) {
  const router = useRouter();
  const t = useTranslations("adminHsCodes");

  return (
    <ArchivePanel
      namespace="adminHsCodes"
      isActive={isActive}
      description={
        isActive
          ? partCount > 0
            ? t("archiveWithUsage", { count: partCount })
            : t("archiveNoUsage")
          : t("restoreHint")
      }
      onToggle={async () => {
        const r = await setHsCodeActive(id, !isActive);
        if (!r.ok) return r.error;
        router.push("/admin/hs-codes");
        router.refresh();
        return null;
      }}
    />
  );
}
