"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { deleteTemplate } from "../_actions/delete-template";

/**
 * Hard delete for unreferenced templates, click-again-to-confirm (same
 * idiom as the part retire action). Referenced templates get a
 * blocked-with-reason error from the action; on success it redirects to
 * the templates list and never resolves here.
 */
export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  const t = useTranslations("templateDetail");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        disabled={isPending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await deleteTemplate(templateId);
            if (result && !result.ok) {
              setError(result.error);
              setConfirming(false);
            }
          });
        }}
      >
        <Trash2 aria-hidden />{" "}
        {isPending
          ? t("deleting")
          : confirming
            ? tCommon("confirmRepeat")
            : t("delete")}
      </Button>
      {error ? (
        <p className="text-destructive max-w-xs text-right text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
