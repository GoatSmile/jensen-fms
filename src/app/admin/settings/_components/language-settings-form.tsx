"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { saveLanguageSettings } from "../_actions/save-settings";

type Lang = "en" | "da";

type Props = {
  initialAppLanguage: Lang;
  initialWorkerLanguage: Lang;
};

/**
 * Working-language preferences. Captures which language the office UI and the
 * build-floor/ticket screens should use. Today this stores the preference;
 * translating the UI itself is a separate effort, and the worker language
 * becomes per-user later.
 */
export function LanguageSettingsForm({
  initialAppLanguage,
  initialWorkerLanguage,
}: Props) {
  const t = useTranslations("adminSettings");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("lang");
  const router = useRouter();
  const [appLanguage, setAppLanguage] = useState<Lang>(initialAppLanguage);
  const [workerLanguage, setWorkerLanguage] = useState<Lang>(
    initialWorkerLanguage,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.set("app_language", appLanguage);
    fd.set("worker_language", workerLanguage);
    start(async () => {
      const r = await saveLanguageSettings(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(t("saved"));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setting-app-language">{t("appLanguageLabel")}</Label>
        <select
          id="setting-app-language"
          value={appLanguage}
          onChange={(e) => setAppLanguage(e.target.value as Lang)}
          className="border-input bg-background h-9 max-w-[260px] rounded-md border px-2 text-sm"
        >
          <option value="en">{tLang("en")}</option>
          <option value="da">{tLang("da")}</option>
        </select>
        <p className="text-muted-foreground text-xs">
          {t("appLanguageHelp")}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setting-worker-language">
          {t("workerLanguageLabel")}
        </Label>
        <select
          id="setting-worker-language"
          value={workerLanguage}
          onChange={(e) => setWorkerLanguage(e.target.value as Lang)}
          className="border-input bg-background h-9 max-w-[260px] rounded-md border px-2 text-sm"
        >
          <option value="en">{tLang("en")}</option>
          <option value="da">{tLang("da")}</option>
        </select>
        <p className="text-muted-foreground text-xs">
          {t("workerLanguageHelp")}
        </p>
      </div>

      <p className="text-muted-foreground max-w-prose text-xs">
        {t("languageRolloutNote")}
      </p>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="text-sm text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : t("saveLanguage")}
        </Button>
      </div>
    </form>
  );
}
