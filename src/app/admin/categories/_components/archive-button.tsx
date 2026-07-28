"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ArchivePanel } from "@/components/archive-panel";

import { setCategoryActive } from "../_actions/manage-categories";

type Props = {
  id: string;
  isActive: boolean;
  partCount: number;
  childCount: number;
};

export function ArchiveButton({ id, isActive, partCount, childCount }: Props) {
  const router = useRouter();
  const t = useTranslations("adminCategories");

  // A category can be held down by parts, by children, or by both, so the
  // reason is composed rather than picked from a fixed pair.
  const hints: string[] = [];
  if (partCount > 0) hints.push(t("hintParts", { count: partCount }));
  if (childCount > 0) hints.push(t("hintChildren", { count: childCount }));

  return (
    <ArchivePanel
      namespace="adminCategories"
      isActive={isActive}
      description={
        isActive
          ? `${t("archiveDescription")}${hints.length ? ` (${hints.join("; ")}.)` : ""}`
          : t("restoreDescription")
      }
      onToggle={async () => {
        const r = await setCategoryActive(id, !isActive);
        if (!r.ok) return r.error;
        router.push("/admin/categories");
        router.refresh();
        return null;
      }}
    />
  );
}
