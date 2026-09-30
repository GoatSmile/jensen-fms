"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { saveCalendarSettings, testCalendar, type CalendarTestResult } from "../_actions/calendar-actions";

type Props = {
  /** "" = off. */
  initialProvider: string;
  initialCalendarId: string;
  providers: string[];
  /** Per provider: its key's env var, whether it is set, and whose it is. */
  secrets: Record<string, { envVar: string; present: boolean; accountEmail: string | null }[]>;
};

/**
 * The service-visits calendar (migration 117): which provider, which calendar,
 * and proof that the key reaches it. The key itself never reaches the browser —
 * its variable name, whether it is set, and the service account's address the
 * calendar must be shared with. Saving a calendar runs the same test first and
 * is refused unless the account may write to it.
 */
export function CalendarSettingsForm(props: Props) {
  const t = useTranslations("adminSettings");
  const tCommon = useTranslations("common");
  const [provider, setProvider] = useState(props.initialProvider);
  const [calendarId, setCalendarId] = useState(props.initialCalendarId);
  const [test, setTest] = useState<CalendarTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();

  const secrets = provider ? (props.secrets[provider] ?? []) : [];

  function runTest() {
    setError(null);
    setTest(null);
    startTest(async () => setTest(await testCalendar(provider, calendarId)));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("provider", provider);
    fd.set("calendar_id", calendarId);
    startSave(async () => {
      const r = await saveCalendarSettings(fd);
      if (!r.ok) return setError(r.error);
      setSaved(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="bg-surface flex flex-col gap-4 rounded-lg p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calendar_provider">{t("providerLabel")}</Label>
            <select
              id="calendar_provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setTest(null);
              }}
              className="border-rule bg-ground h-9 rounded-md border px-2 text-sm"
            >
              <option value="">{t("calendarOff")}</option>
              {props.providers.map((key) => (
                <option key={key} value={key}>
                  {t.has(`calendarProvider_${key}`) ? t(`calendarProvider_${key}`) : key}
                </option>
              ))}
            </select>
          </div>
        </div>

        {provider ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="calendar_id" className="flex-col items-start gap-0.5">
                {t("calendarIdLabel")}
                <span className="text-ink-2 text-xs font-normal">{t("calendarIdHint")}</span>
              </Label>
              <Input
                id="calendar_id"
                value={calendarId}
                onChange={(e) => {
                  setCalendarId(e.target.value);
                  setTest(null);
                }}
                placeholder="…@group.calendar.google.com"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              {secrets.map((s) => (
                <div key={s.envVar} className="flex flex-col gap-0.5 text-sm">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <code className="text-xs">{s.envVar}</code>
                    <span className={cn("inline-flex items-center gap-1 text-xs", s.present ? "text-good" : "text-alert")}>
                      {s.present ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                      {s.present ? t("secretSet") : t("secretMissing")}
                    </span>
                  </span>
                  {s.accountEmail ? (
                    <span className="text-ink-2 text-xs">
                      {t("calendarShareWith")} <code className="break-all">{s.accountEmail}</code>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="outline" onClick={runTest} disabled={testing || !calendarId.trim()}>
                {testing ? t("calendarTesting") : t("calendarTest")}
              </Button>
              {test ? (
                test.ok ? (
                  <span className={cn("text-sm", test.canWrite ? "text-good" : "text-money")} role="status">
                    {test.canWrite
                      ? t("calendarTestOk", { name: test.name, tz: test.timeZone })
                      : t("calendarTestReadOnly", { name: test.name })}
                  </span>
                ) : (
                  <span className="text-alert text-sm" role="alert">
                    {test.error}
                  </span>
                )
              ) : null}
            </div>

            <p className="text-ink-2 text-xs">
              <a
                href="https://calendar.google.com/calendar/r"
                target="_blank"
                rel="noreferrer"
                className="text-brand-ink underline underline-offset-2"
              >
                {t("calendarOpenGoogle")}
              </a>{" "}
              {t("calendarOpenGoogleHint")}
            </p>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? tCommon("saving") : t("calendarSave")}
        </Button>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {saved ? (
          <p className="text-good text-sm" role="status">
            {t("calendarSaved")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
