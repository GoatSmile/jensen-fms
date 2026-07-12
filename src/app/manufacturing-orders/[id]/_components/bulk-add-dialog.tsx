"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { bulkAddBikesToMO } from "../_actions/bulk-add-bikes";

type Props = {
  moId: string;
  slotsRemaining: number;
  /** Disabled when MO is closed or full. */
  disabled?: boolean;
  disabledReason?: string;
};

export function BulkAddDialog({
  moId,
  slotsRemaining,
  disabled,
  disabledReason,
}: Props) {
  const t = useTranslations("moDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setCount(String(Math.min(slotsRemaining, 10)));
      setError(null);
    }
    setOpen(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const n = Number(count);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      setError(t("errPositiveWhole"));
      return;
    }
    start(async () => {
      const r = await bulkAddBikesToMO(moId, n);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          <Layers aria-hidden /> {t("bulkAdd")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("bulkAddTitle")}</DialogTitle>
            <DialogDescription>
              {t.rich("bulkAddDesc", {
                count: slotsRemaining,
                em: (chunks) => <em>{chunks}</em>,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-count">{t("howManyBikes")}</Label>
            <Input
              id="bulk-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.min(slotsRemaining, 100)}
              step={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              autoFocus
              required
            />
            <p className="text-muted-foreground text-xs">
              {t("bulkMaxHint", { max: Math.min(slotsRemaining, 100) })}
            </p>
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || count.trim() === ""}
            >
              {isPending ? t("creating") : t("createBikes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
