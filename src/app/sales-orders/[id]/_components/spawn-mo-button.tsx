"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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

/** What to ask after a spawn — rendered by the lines section, not the button. */
export type SpawnPrompt =
  | {
      /** Other bike lines still need an MO: stay here rather than walk away. */
      kind: "more";
      moId: string;
      moNumber: string;
      remaining: number;
    }
  | {
      /** The last line is spawned and something needs paint: ask once. */
      kind: "paint";
      moId: string;
      moNumber: string;
      needsPaint: number;
      colourLabel: string | null;
    };

/**
 * "Spawn MO" — the one action that turns a sold line into work on the floor.
 *
 * It stays OUT of the row's ⋯ menu (owner, 2026-09-02): a line that has never
 * been spawned looks identical to one that has until you open the menu. It
 * renders only while it can fire — template line, no MO yet — so its presence
 * IS the state. It sits in the actions column immediately left of the ⋯ menu
 * (owner, 2026-09-04); it was beside the template name until then, which pushed
 * the item text around as rows gained and lost the button.
 *
 * Because it disappears the moment its line has an MO, it must NOT own the
 * dialog that follows: the action revalidates the page, the row re-renders
 * without the button, and a dialog held in the button's state unmounts with
 * it. That is exactly how the paint prompt never appeared (found 2026-09-27).
 * The button reports what to ask through `onPrompt`; `SpawnPromptDialog`,
 * mounted by the always-present lines section, asks it.
 *
 * Sales-order-only, which is why it lives here and reaches the shared lines
 * table through its `renderRowActions` slot rather than being a prop on it.
 */
export function SpawnMoButton({
  soId,
  lineId,
  disabled,
  onError,
  onPrompt,
}: {
  soId: string;
  lineId: string;
  disabled?: boolean;
  onError: (message: string | null) => void;
  onPrompt: (prompt: SpawnPrompt) => void;
}) {
  const t = useTranslations("soDetail");
  const router = useRouter();
  const [pending, start] = useTransition();

  function runSpawn() {
    onError(null);
    start(async () => {
      const r = await spawnMOFromSOLine(soId, lineId);
      if (!r.ok) {
        onError(r.error);
        return;
      }
      // One paint job per sales order (15 Sep): while other bike lines have no
      // MO, stay on the SO so they get spawned too — and ask about paint once.
      if (r.remainingLines > 0) {
        onPrompt({
          kind: "more",
          moId: r.moId,
          moNumber: r.moNumber,
          remaining: r.remainingLines,
        });
        return;
      }
      // Dennis, 1 Sep: "they ask you, do you want to create a paint order?
      // because if it's the black and we have it on stock, I just put no."
      // Nothing to paint means nothing to ask — go where the button always
      // went.
      if (r.needsPaint > 0) {
        onPrompt({
          kind: "paint",
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

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={runSpawn}
      disabled={pending || disabled}
    >
      <Hammer aria-hidden /> {t("spawnMo")}
    </Button>
  );
}

/**
 * The question after a spawn. Asked at the moment the order becomes work, not
 * left to be noticed on the MO's coverage panel. Answering "not now" is a real
 * answer: the frames may be black and already on the shelf.
 */
export function SpawnPromptDialog({
  soId,
  prompt,
  onClose,
}: {
  soId: string;
  prompt: SpawnPrompt | null;
  onClose: () => void;
}) {
  const t = useTranslations("soDetail");
  const router = useRouter();

  function openMo(moId: string) {
    onClose();
    router.push(`/manufacturing-orders/${moId}`);
  }

  if (!prompt) return null;

  if (prompt.kind === "more") {
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("spawnMoreTitle", { mo: prompt.moNumber })}</DialogTitle>
            <DialogDescription>
              {t("spawnMoreBody", { count: prompt.remaining })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => openMo(prompt.moId)}>
              {t("paintPromptOpenMo")}
            </Button>
            <Button onClick={onClose}>{t("spawnMoreStay")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && openMo(prompt.moId)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("paintPromptTitle")}</DialogTitle>
          <DialogDescription>
            {t("paintPromptBody", {
              mo: prompt.moNumber,
              count: prompt.needsPaint,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => openMo(prompt.moId)}>
            {t("paintPromptOpenMo")}
          </Button>
          <Button asChild>
            <Link href={`/sales-orders/${soId}/paint/new`} onClick={onClose}>
              {t("paintPromptCreate")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
