"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DictateButton } from "@/components/dictate-button";

import { createCommandFromText } from "../_actions/command";

/**
 * In-app command ingress (VC-1, Option A — text-first). Type a task or dictate
 * it with the browser speech button; on submit the command agent drafts the
 * actions and we jump to the command row's review panel. No audio upload — the
 * phone/Gladia ingress folds in with VC-3 (DECISIONS 2026-07-23).
 */
export function NewCommand() {
  const t = useTranslations("inboxCommand");
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const r = await createCommandFromText(body);
      if (!r.ok) return setError(r.error);
      router.push(`/inbox/${r.id}`);
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2">
        <Sparkles className="text-muted-foreground size-4" aria-hidden />
        <h2 className="text-sm font-semibold">{t("newTitle")}</h2>
      </div>
      <p className="text-muted-foreground text-xs">{t("newHint")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("newPlaceholder")}
        className="border-input bg-background w-full rounded-md border p-3 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={pending || !text.trim()}>
          <Sparkles aria-hidden />
          {pending ? t("drafting") : t("draftActions")}
        </Button>
        <DictateButton
          onAppend={(txt) => setText((prev) => (prev.trim() ? `${prev}\n${txt}` : txt))}
          label={t("dictate")}
        />
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
