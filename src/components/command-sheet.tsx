"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { readDictationReady } from "@/app/_actions/dictation-ready";
import { createCommandFromText } from "@/app/calls/_actions/command";
import { DictateButton } from "@/components/dictate-button";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Dictate a command, from anywhere (DECISIONS 2026-09-29): it used to be a
 * box on the inbox page, which put a TOOL inside a work queue. Now a button
 * in the app chrome — under the logo in the sidebar, on the right of the
 * phone header — opens this sheet; submitting drafts the actions and lands on
 * the command's review page under /commands. Shown only to holders of
 * `inbox`, which command actions require anyway.
 */
export function CommandSheet({ variant }: { variant: "sidebar" | "rail" | "mobile" }) {
  const t = useTranslations("inboxCommand");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, start] = useTransition();

  // Readiness is asked when the sheet opens, not on every page render.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    readDictationReady().then((r) => {
      if (!cancelled) setReady(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function submit() {
    setError(null);
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const r = await createCommandFromText(body);
      if (!r.ok) return setError(r.error);
      setText("");
      setOpen(false);
      router.push(`/commands/${r.id}`);
    });
  }

  const trigger =
    variant === "mobile" ? (
      <Button variant="ghost" size="icon-sm" aria-label={t("newTitle")}>
        <Sparkles aria-hidden />
      </Button>
    ) : (
      <button
        type="button"
        aria-label={variant === "rail" ? t("newTitle") : undefined}
        className={cn(
          "bg-brand-wash text-brand-ink hover:bg-brand-wash/80 flex w-full items-center gap-2.5 rounded-full py-2 text-sm font-medium transition-colors",
          variant === "rail" ? "justify-center px-0" : "px-3",
        )}
      >
        <Sparkles aria-hidden className="size-4 shrink-0" />
        {variant === "rail" ? null : <span className="truncate">{t("newTitle")}</span>}
      </button>
    );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {variant === "rail" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>{trigger}</SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{t("newTitle")}</TooltipContent>
        </Tooltip>
      ) : (
        <SheetTrigger asChild>{trigger}</SheetTrigger>
      )}
      {/* Scoped like the Sheet's own width rule (data-[side=right]:w-3/4), or
          that rule wins: full width on a phone, a readable column above. */}
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle className="inline-flex items-center gap-1.5">
            <Sparkles className="size-4" aria-hidden />
            {t("newTitle")}
          </SheetTitle>
          <SheetDescription>{t("newHint")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={t("newPlaceholder")}
            className="border-rule bg-ground w-full rounded-md border p-3 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={submit} disabled={pending || !text.trim()}>
              <Sparkles aria-hidden />
              {pending ? t("drafting") : t("draftActions")}
            </Button>
            <DictateButton
              onAppend={(txt) => setText((prev) => (prev.trim() ? `${prev}\n${txt}` : txt))}
              label={t("dictate")}
              ready={ready}
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
