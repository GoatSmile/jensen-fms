"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

import { duplicateTemplate } from "../_actions/duplicate-template";

/**
 * Copy this template into a brand-new one (version 1, "(copy)" name), distinct
 * from "save as new version". The action redirects to the copy on success;
 * only a failure returns here, which we surface inline.
 */
export function DuplicateTemplateButton({ templateId }: { templateId: string }) {
  const t = useTranslations("templateDetail");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            // On success this redirects and never resolves here.
            const result = await duplicateTemplate(templateId);
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        <Copy aria-hidden /> {isPending ? t("duplicating") : t("duplicate")}
      </Button>
      {error ? (
        <p className="text-destructive max-w-xs text-right text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
