"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { addBikeToPaintOrder } from "../_actions/add-bike-to-paint";

export type EligibleBikeOption = {
  id: string;
  frameNumber: string;
  templateLabel: string | null;
};

type Props = {
  serviceOrderId: string;
  bikes: EligibleBikeOption[];
  disabled?: boolean;
  disabledReason?: string;
};

export function AddBikeToPaintDialog({
  serviceOrderId,
  bikes,
  disabled,
  disabledReason,
}: Props) {
  const t = useTranslations("paintOrderDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [bikeId, setBikeId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return bikes.slice(0, 100);
    return bikes
      .filter(
        (b) =>
          b.frameNumber.toLowerCase().includes(needle) ||
          (b.templateLabel?.toLowerCase().includes(needle) ?? false),
      )
      .slice(0, 100);
  }, [bikes, q]);

  function reset() {
    setQ("");
    setBikeId("");
    setNotes("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) reset();
    setOpen(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!bikeId) {
      setError(t("errPickBike"));
      return;
    }
    start(async () => {
      const r = await addBikeToPaintOrder(serviceOrderId, bikeId, { notes });
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
          <Plus aria-hidden /> {t("addBike")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("addBikeTitle")}</DialogTitle>
            <DialogDescription>{t("addBikeDesc")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-search">{t("findBike")}</Label>
            <Input
              id="paint-bike-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("findBikePlaceholder")}
              className="font-mono"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-pick">{t("bike")}</Label>
            <Select value={bikeId} onValueChange={setBikeId}>
              <SelectTrigger id="paint-bike-pick">
                <SelectValue placeholder={t("pickBikePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {filtered.length === 0 ? (
                  <div className="text-muted-foreground p-2 text-xs">
                    {t("noBikesMatch")}
                  </div>
                ) : (
                  filtered.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="font-mono">{b.frameNumber}</span>
                      {b.templateLabel ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {b.templateLabel}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-notes">{t("notes")}</Label>
            <Textarea
              id="paint-bike-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("addBikeNotesPlaceholder")}
            />
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
            <Button type="submit" disabled={isPending || bikeId === ""}>
              {isPending ? t("adding") : t("addBike")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
