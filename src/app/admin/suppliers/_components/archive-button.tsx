"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ArchivePanel } from "@/components/archive-panel";

import { setSupplierActive } from "../_actions/manage-suppliers";

type Props = {
  id: string;
  isActive: boolean;
  partCount: number;
};

export function ArchiveButton({ id, isActive, partCount }: Props) {
  const router = useRouter();
  const t = useTranslations("adminSuppliers");

  return (
    <ArchivePanel
      namespace="adminSuppliers"
      isActive={isActive}
      description={
        isActive
          ? partCount > 0
            ? t("archiveWithParts", { count: partCount })
            : t("archiveNoParts")
          : t("restoreDesc")
      }
      onToggle={async () => {
        const r = await setSupplierActive(id, !isActive);
        if (!r.ok) return r.error;
        router.push("/admin/suppliers");
        router.refresh();
        return null;
      }}
    />
  );
}
