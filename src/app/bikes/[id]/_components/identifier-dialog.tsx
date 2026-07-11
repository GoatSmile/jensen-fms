"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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

import { createBikeIdentifier } from "../_actions/manage-identifiers";

export type IdentifierTypeOption = {
  id: string;
  slug: string;
  name_en: string;
  format_regex: string | null;
  is_required: boolean;
  /** Already-registered active types. We disable picking these to nudge the
   *  user to deactivate the current one first if they want to replace it. */
  alreadyRegistered: boolean;
};

type Props = {
  bikeId: string;
  identifierTypes: IdentifierTypeOption[];
  /** Visual hint above the trigger button. */
  triggerLabel?: string;
  /** Extra routes to revalidate when used outside the bike detail page
   *  (e.g. the build workbench renders this bike's identifiers). */
  extraRevalidatePaths?: string[];
};

export function IdentifierDialog({
  bikeId,
  identifierTypes,
  triggerLabel,
  extraRevalidatePaths,
}: Props) {
  const t = useTranslations("identifierDialog");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    // Reset state every time the dialog opens (or closes) so a stale typed
    // value from a previous attempt doesn't bleed in.
    if (next) {
      setTypeId("");
      setValue("");
      setNotes("");
      setError(null);
      setErrorField(null);
    }
    setOpen(next);
  }

  const selectedType = useMemo(
    () => identifierTypes.find((idType) => idType.id === typeId),
    [identifierTypes, typeId],
  );

  // Live regex preview — gives the user feedback before submit. Server-side
  // validation runs again to catch tampering.
  const regexHint = useMemo(() => {
    if (!selectedType?.format_regex) return null;
    if (value === "") return null;
    try {
      const re = new RegExp(selectedType.format_regex);
      return { ok: re.test(value), regex: selectedType.format_regex };
    } catch {
      return null;
    }
  }, [selectedType, value]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = new FormData();
    fd.append("identifier_type_id", typeId);
    fd.append("identifier_value", value);
    fd.append("notes", notes);
    startTransition(async () => {
      const r = await createBikeIdentifier(bikeId, fd, extraRevalidatePaths);
      if (!r.ok) {
        setError(r.error);
        setErrorField(r.field ?? null);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {triggerLabel ?? t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="id-type">{t("typeLabel")}</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger id="id-type">
                <SelectValue placeholder={t("typePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {identifierTypes.map((idType) => (
                  <SelectItem
                    key={idType.id}
                    value={idType.id}
                    disabled={idType.alreadyRegistered}
                  >
                    {idType.name_en}
                    {idType.is_required ? (
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        {t("required")}
                      </span>
                    ) : null}
                    {idType.alreadyRegistered ? (
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        {t("alreadyRegistered")}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorField === "identifier_type_id" && error ? (
              <p className="text-destructive text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="id-value">{t("valueLabel")}</Label>
            <Input
              id="id-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                selectedType?.format_regex
                  ? t("valuePlaceholderRegex", {
                      regex: selectedType.format_regex,
                    })
                  : t("valuePlaceholder")
              }
              className="font-mono"
              autoFocus
            />
            {regexHint ? (
              <p
                className={`text-xs ${
                  regexHint.ok
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {regexHint.ok
                  ? t("formatOk")
                  : t("formatMismatch", { regex: regexHint.regex })}
              </p>
            ) : null}
            {errorField === "identifier_value" && error ? (
              <p className="text-destructive text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="id-notes">{t("notesLabel")}</Label>
            <Textarea
              id="id-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
            />
          </div>

          {error && !errorField ? (
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
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !typeId || value.trim() === ""}
            >
              {isPending ? t("registering") : t("register")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
