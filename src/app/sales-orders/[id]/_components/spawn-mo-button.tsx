"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Hammer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { spawnMOFromSOLine } from "../../_actions/spawn-mo";

/**
 * "Spawn MO" — the one action that turns a sold line into work on the floor.
 *
 * It sits BESIDE the template rather than in the row's ⋯ menu (owner,
 * 2026-09-02): a line that has never been spawned looks identical to one that
 * has until you open the menu. It renders only while it can fire — template
 * line, no MO yet — so its presence IS the state.
 *
 * Sales-order-only, which is why it lives here and reaches the shared lines
 * table through its `renderItemExtra` slot rather than being a prop on it.
 */
export function SpawnMoButton({
  soId,
  lineId,
  disabled,
  onError,
}: {
  soId: string;
  lineId: string;
  disabled?: boolean;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations("soDetail");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paintPrompt, setPaintPrompt] = useState<{
    moId: string;
    moNumber: string;
    needsPaint: number;
    colourLabel: string | null;
  } | null>(null);

  function runSpawn() {
    onError(null);
    start(async () => {
      const r = await spawnMOFromSOLine(soId, lineId);
      if (!r.ok) {
        onError(r.error);
        return;
      }
      // Dennis, 1 Sep: "they ask you, do you want to create a paint order?
      // because if it's the black and we have it on stock, I just put no."
      // Nothing to paint means nothing to ask — go where the button always
      // went.
      if (r.needsPaint > 0) {
        setPaintPrompt({
          moId: r.moId,
          moNumber: r.moNumber,
          needsPaint: r.needsPaint,
          colourLabel: r.colourLabel,
        });
        return;
      }
      router.push(`/manufacturing-orders/${r.moId}`);
    });
  }

  function openMo(moId: string) {
    setPaintPrompt(null);
    router.push(`/manufacturing-orders/${moId}`);
  }

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        onClick={runSpawn}
        disabled={pending || disabled}
      >
        <Hammer aria-hidden /> {t("spawnMo")}
      </Button>

      {/* Asked at the moment the order becomes work, not left to be noticed on
          the MO's coverage panel. Answering "not now" is a real answer: the
          frames may be black and already on the shelf. */}
      {paintPrompt ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) openMo(paintPrompt.moId);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("paintPromptTitle")}</DialogTitle>
              <DialogDescription>
                {t("paintPromptBody", {
                  mo: paintPrompt.moNumber,
                  count: paintPrompt.needsPaint,
                  colour: paintPrompt.colourLabel ?? t("paintPromptThatColour"),
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => openMo(paintPrompt.moId)}
              >
                {t("paintPromptOpenMo")}
              </Button>
              <Button asChild>
                <Link href={`/sales-orders/${soId}/paint/new`}>
                  {t("paintPromptCreate")}
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
