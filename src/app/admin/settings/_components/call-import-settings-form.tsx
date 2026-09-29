"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CallEndpoint } from "@/lib/inbound/call-import/types";
import { formatDateTime } from "@/lib/parts/format";
import { cn } from "@/lib/utils";

import {
  listCallImportEndpoints,
  saveCallImportSettings,
} from "../_actions/call-import-actions";

type SecretStatus = { envVar: string; present: boolean };

type Props = {
  /** "" = off. */
  initialProvider: string;
  initialEndpoints: string[];
  initialVoicemails: boolean;
  initialLookbackHours: string;
  providers: string[];
  secrets: SecretStatus[];
  lastRun: { at: string; ok: boolean | null; summary: string | null } | null;
};

/**
 * Call import (migration 111): which of the shop's own phone systems the
 * inbox pulls recorded calls from, and whose. The people come from the
 * provider's live list — loading it is the connection test — so nobody types
 * an endpoint id. The token is an env secret, shown only as set / missing.
 */
export function CallImportSettingsForm(props: Props) {
  const t = useTranslations("adminSettings");
  const tCommon = useTranslations("common");

  const [provider, setProvider] = useState(props.initialProvider);
  const [endpoints, setEndpoints] = useState<string[]>(props.initialEndpoints);
  const [voicemails, setVoicemails] = useState(props.initialVoicemails);
  const [lookback, setLookback] = useState(props.initialLookbackHours);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Stamped with the provider it describes, so "loading" is derived rather
  // than a flag an effect resets (the ModelField pattern next door).
  const [loaded, setLoaded] = useState<{
    provider: string;
    list: CallEndpoint[];
    error: string | null;
  } | null>(null);
  const secretsReady = props.secrets.every((s) => s.present);
  useEffect(() => {
    if (!provider || !secretsReady) return;
    let cancelled = false;
    listCallImportEndpoints(provider).then((r) => {
      if (cancelled) return;
      setLoaded(
        r.ok
          ? { provider, list: r.endpoints, error: null }
          : { provider, list: [], error: r.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [provider, secretsReady]);
  const fresh = loaded?.provider === provider ? loaded : null;

  // A saved id the provider no longer lists still shows, ticked, so saving
  // can't drop it silently — and the label says why it looks odd.
  const listed = fresh?.list ?? [];
  const orphans = endpoints.filter((id) => !listed.some((e) => e.id === id));

  function toggle(id: string, on: boolean) {
    setEndpoints((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  function providerLabel(key: string): string {
    return t.has(`provider_${key}`) ? t(`provider_${key}`) : key;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.set("provider", provider);
    for (const id of endpoints) fd.append("endpoints", id);
    if (voicemails) fd.set("voicemails", "on");
    fd.set("lookback_hours", lookback.trim());
    start(async () => {
      const r = await saveCallImportSettings(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(t("saved"));
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="bg-surface flex flex-col gap-4 rounded-lg p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="call_import_provider">{t("providerLabel")}</Label>
            <select
              id="call_import_provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="border-rule bg-ground h-9 rounded-md border px-2 text-sm"
            >
              <option value="">{t("callImportOff")}</option>
              {props.providers.map((key) => (
                <option key={key} value={key}>
                  {providerLabel(key)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1 pb-2">
            {props.secrets.map((s) => (
              <span
                key={s.envVar}
                className={cn(
                  "inline-flex items-center gap-1 text-xs",
                  s.present ? "text-good" : "text-alert",
                )}
              >
                {s.present ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <X className="size-3.5" aria-hidden />
                )}
                <span className="font-mono">{s.envVar}</span>
                <span>{s.present ? t("secretSet") : t("secretMissing")}</span>
              </span>
            ))}
          </div>
        </div>

        {provider ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="flex flex-col gap-0.5 pb-1 text-sm font-medium">
                {t("callImportWhoLabel")}
                <span className="text-ink-2 text-xs font-normal">
                  {t("callImportWhoHint")}
                </span>
              </legend>
              {!secretsReady ? (
                <p className="text-alert text-sm">{t("callImportNeedsSecret")}</p>
              ) : fresh === null ? (
                <p className="text-ink-2 text-sm">{t("callImportLoading")}</p>
              ) : fresh.error ? (
                <p className="text-alert text-sm">{fresh.error}</p>
              ) : null}
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {listed.map((ep) => (
                  <label key={ep.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={endpoints.includes(ep.id)}
                      onChange={(e) => toggle(ep.id, e.target.checked)}
                      className="accent-primary size-4"
                    />
                    {ep.name}
                  </label>
                ))}
                {fresh && !fresh.error
                  ? orphans.map((id) => (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked
                          onChange={(e) => toggle(id, e.target.checked)}
                          className="accent-primary size-4"
                        />
                        <span className="font-mono text-xs">{id}</span>
                        <span className="text-money text-xs">
                          {t("callImportNotListed")}
                        </span>
                      </label>
                    ))
                  : null}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2">
                <input
                  id="call_import_voicemails"
                  type="checkbox"
                  checked={voicemails}
                  onChange={(e) => setVoicemails(e.target.checked)}
                  className="accent-primary mt-0.5 size-4"
                />
                <Label
                  htmlFor="call_import_voicemails"
                  className="flex-col items-start gap-0.5 text-sm font-normal"
                >
                  {t("callImportVoicemailsLabel")}
                  <span className="text-ink-2 text-xs">
                    {t("callImportVoicemailsHint")}
                  </span>
                </Label>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="call_import_lookback"
                  className="flex-col items-start gap-0.5"
                >
                  {t("callImportLookbackLabel")}
                  <span className="text-ink-2 text-xs font-normal">
                    {t("callImportLookbackHint")}
                  </span>
                </Label>
                <Input
                  id="call_import_lookback"
                  inputMode="numeric"
                  value={lookback}
                  onChange={(e) => setLookback(e.target.value)}
                  placeholder="48"
                  className="sm:max-w-32"
                />
              </div>
            </div>
          </>
        ) : null}

        <p className="text-ink-2 text-xs">
          {t("callImportSchedule")}{" "}
          {props.lastRun ? (
            <span className={props.lastRun.ok === false ? "text-alert" : undefined}>
              {t("callImportLastRun", {
                at: formatDateTime(props.lastRun.at),
                summary: props.lastRun.summary ?? "—",
              })}
            </span>
          ) : (
            t("callImportNeverRun")
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tCommon("saving") : t("callImportSave")}
        </Button>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {success ? (
          <p className="text-good text-sm" role="status">
            {success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
