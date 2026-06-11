"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";

import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { kitCode, stickerColor } from "@/lib/kits/colors";

import { labelTemplateBomWithKit } from "../_actions/label-bom-kit";

export type KitChoice = {
  id: string;
  sticker_color: string;
  kit_number: number | null;
};

/**
 * Bulk kit labelling for a template's BOM: pick a kit, apply the sticker
 * label to every part in the current recipe in one click. One-shot writer —
 * later recipe edits don't move labels.
 */
export function LabelBomKit({
  templateId,
  kits,
  bomPartCount,
}: {
  templateId: string;
  kits: KitChoice[];
  bomPartCount: number;
}) {
  const router = useRouter();
  const [kitId, setKitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onApply() {
    if (!kitId) return;
    setError(null);
    setSuccess(null);
    start(async () => {
      const r = await labelTemplateBomWithKit(templateId, kitId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const kit = kits.find((k) => k.id === kitId);
      const code = kit ? kitCode(kit.sticker_color, kit.kit_number) : "kit";
      setSuccess(
        `${code}: labelled ${r.labelled} part${r.labelled === 1 ? "" : "s"}` +
          (r.already > 0 ? ` (${r.already} already had it)` : "") +
          ".",
      );
      router.refresh();
    });
  }

  if (kits.length === 0) return null;

  return (
    <Section
      title="Kit labelling"
      description="Stick one kit label on every part in this recipe — the floor then picks the whole build by sticker code."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kitId} onValueChange={setKitId} disabled={pending}>
          <SelectTrigger className="w-52" aria-label="Kit">
            <SelectValue placeholder="Pick a kit…" />
          </SelectTrigger>
          <SelectContent>
            {kits.map((k) => {
              const colour = stickerColor(k.sticker_color);
              return (
                <SelectItem key={k.id} value={k.id}>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block size-3 rounded-full border border-black/10"
                      style={{ backgroundColor: colour.hex }}
                    />
                    {kitCode(k.sticker_color, k.kit_number)}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={onApply}
          disabled={pending || !kitId || bomPartCount === 0}
        >
          <Tags aria-hidden />{" "}
          {pending
            ? "Labelling…"
            : `Label all ${bomPartCount} part${bomPartCount === 1 ? "" : "s"}`}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-2 text-xs text-emerald-700">{success}</p>
      ) : null}
    </Section>
  );
}
