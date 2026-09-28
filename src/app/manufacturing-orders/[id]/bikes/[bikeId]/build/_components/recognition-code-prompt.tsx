"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBikeIdentifier } from "@/app/bikes/[id]/_actions/manage-identifiers";

/**
 * "Does this bike get a recognition code?" — asked at build, pre-filled with
 * the customer's prefix and the next number in their sequence (Dennis, 15 Sep:
 * "It should ask you, but you can decline"). Saving registers it as the
 * bike's `fleet_number` identifier; *Skip* just hides the question — a bike
 * with no service agreement gets no code, only its QR.
 */
export function RecognitionCodePrompt({
  bikeId,
  revalidatePath,
  typeId,
  suggestion,
  recent,
}: {
  bikeId: string;
  revalidatePath: string;
  typeId: string;
  suggestion: string;
  recent: string[];
}) {
  const t = useTranslations("build");
  const [value, setValue] = useState(suggestion);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (skipped) return null;

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("identifier_type_id", typeId);
    fd.set("identifier_value", value.trim().toUpperCase());
    start(async () => {
      const r = await createBikeIdentifier(bikeId, fd, [revalidatePath]);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="bg-brand-wash flex flex-col gap-2 rounded-lg p-3">
      <p className="text-sm font-medium">{t("recognitionAsk")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="bg-surface h-10 w-36 font-mono text-base"
          aria-label={t("recognitionLabel")}
          autoComplete="off"
        />
        <Button size="sm" onClick={save} disabled={pending || !value.trim()}>
          {pending ? t("recognitionSaving") : t("recognitionSave")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSkipped(true)}
          disabled={pending}
        >
          {t("recognitionSkip")}
        </Button>
      </div>
      {recent.length > 0 ? (
        <p className="text-ink-2 text-xs">
          {t("recognitionRecent", { codes: recent.join(", ") })}
        </p>
      ) : null}
      {error ? (
        <p className="text-alert text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
