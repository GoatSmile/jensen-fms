"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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

export type SavedLine = {
  endpoint: string;
  endpoint_name: string | null;
  line_number: string | null;
  person_id: string | null;
  label: string | null;
  token_env: string;
  import_enabled: boolean;
};

type Props = {
  /** "" = off. */
  initialProvider: string;
  initialVoicemails: boolean;
  initialLookbackHours: string;
  providers: string[];
  savedLines: SavedLine[];
  people: { id: string; name: string }[];
  /** Present/missing per token variable name already in use or the default. */
  tokenStatus: Record<string, boolean>;
  defaultTokenEnv: string;
  lastRun: { at: string; ok: boolean | null; summary: string | null } | null;
};

type Row = SavedLine & { listed: boolean };

/**
 * Call import (migrations 111 + 112): the provider, and the PHONE LINES —
 * one row per line the provider lists, each switched on or off, mapped to the
 * person whose calls they are (or labelled as a shared line), and naming the
 * env var that holds that line's token. The provider lets only a number's own
 * user hear its recordings, which is why the token is per line. Token values
 * never reach the browser: a name, and whether it is set.
 */
export function CallImportSettingsForm(props: Props) {
  const t = useTranslations("adminSettings");
  const tCommon = useTranslations("common");

  const [provider, setProvider] = useState(props.initialProvider);
  const [voicemails, setVoicemails] = useState(props.initialVoicemails);
  const [lookback, setLookback] = useState(props.initialLookbackHours);
  const [edits, setEdits] = useState<Record<string, Partial<SavedLine>>>({});
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
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    listCallImportEndpoints(provider).then((r) => {
      if (cancelled) return;
      setLoaded(
        r.ok ? { provider, list: r.endpoints, error: null } : { provider, list: [], error: r.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [provider]);
  const fresh = loaded?.provider === provider ? loaded : null;

  // Every line the provider lists, merged with the saved ones — a saved line
  // the provider no longer lists still shows, so it can be switched off.
  const rows: Row[] = useMemo(() => {
    const saved = new Map(props.savedLines.map((l) => [l.endpoint, l]));
    const out: Row[] = [];
    for (const ep of fresh?.list ?? []) {
      const s = saved.get(ep.id);
      out.push({
        endpoint: ep.id,
        endpoint_name: ep.name,
        line_number: ep.number ?? s?.line_number ?? null,
        person_id: s?.person_id ?? null,
        label: s?.label ?? null,
        token_env: s?.token_env ?? props.defaultTokenEnv,
        import_enabled: s?.import_enabled ?? false,
        listed: true,
      });
      saved.delete(ep.id);
    }
    for (const s of saved.values()) out.push({ ...s, listed: false });
    return out.map((r) => ({ ...r, ...edits[r.endpoint] }));
  }, [fresh, props.savedLines, props.defaultTokenEnv, edits]);

  function edit(endpoint: string, patch: Partial<SavedLine>) {
    setEdits((prev) => ({ ...prev, [endpoint]: { ...prev[endpoint], ...patch } }));
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
    if (voicemails) fd.set("voicemails", "on");
    fd.set("lookback_hours", lookback.trim());
    // EVERY line the provider lists is written, import on or off: the lines'
    // numbers are how a call between two colleagues is recognised as internal
    // (src/lib/calls/triage.ts), and a colleague whose line is not imported is
    // still a colleague.
    fd.set(
      "lines",
      JSON.stringify(
        rows.map((r) => ({
            endpoint: r.endpoint,
            endpoint_name: r.endpoint_name,
            line_number: r.line_number,
            person_id: r.person_id,
            label: r.person_id ? null : (r.label ?? r.endpoint_name),
            token_env: r.token_env.trim().toUpperCase(),
            import_enabled: r.import_enabled,
          })),
      ),
    );
    start(async () => {
      const r = await saveCallImportSettings(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEdits({});
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
        </div>

        {provider ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="flex flex-col gap-0.5 pb-1 text-sm font-medium">
                {t("callImportLinesLabel")}
                <span className="text-ink-2 text-xs font-normal">{t("callImportLinesHint")}</span>
              </legend>
              {fresh === null ? (
                <p className="text-ink-2 text-sm">{t("callImportLoading")}</p>
              ) : fresh.error ? (
                <p className="text-alert text-sm">{fresh.error}</p>
              ) : null}

              {rows.length > 0 ? (
                <div className="divide-rule flex flex-col divide-y">
                  {rows.map((r) => {
                    const env = r.token_env.trim().toUpperCase();
                    const known = env in props.tokenStatus;
                    const set = props.tokenStatus[env] === true;
                    return (
                      <div
                        key={r.endpoint}
                        className="grid items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.3fr)]"
                      >
                        <label className="flex min-w-0 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={r.import_enabled}
                            onChange={(e) => edit(r.endpoint, { import_enabled: e.target.checked })}
                            className="accent-primary size-4 shrink-0"
                            aria-label={t("callImportLineToggle", { name: r.endpoint_name ?? r.endpoint })}
                          />
                          <span className="min-w-0">
                            <span className={cn("block truncate", !r.import_enabled && "text-ink-2")}>
                              {r.endpoint_name ?? r.endpoint}
                            </span>
                            <span className="text-ink-3 block truncate font-mono text-xs">
                              {r.line_number ?? r.endpoint}
                              {!r.listed ? ` · ${t("callImportNotListed")}` : ""}
                            </span>
                          </span>
                        </label>

                        <div className="flex min-w-0 flex-col gap-1">
                          <select
                            value={r.person_id ?? ""}
                            onChange={(e) => edit(r.endpoint, { person_id: e.target.value || null })}
                            aria-label={t("callImportPersonLabel")}
                            className="border-rule bg-ground h-9 rounded-md border px-2 text-sm"
                          >
                            <option value="">{t("callImportSharedLine")}</option>
                            {props.people.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {!r.person_id ? (
                            <Input
                              value={r.label ?? r.endpoint_name ?? ""}
                              onChange={(e) => edit(r.endpoint, { label: e.target.value })}
                              placeholder={t("callImportLabelPlaceholder")}
                              aria-label={t("callImportLabelLabel")}
                              className="h-8 text-sm"
                            />
                          ) : null}
                        </div>

                        <div className="flex min-w-0 flex-col gap-1">
                          <Input
                            value={r.token_env}
                            onChange={(e) => edit(r.endpoint, { token_env: e.target.value })}
                            aria-label={t("callImportTokenLabel")}
                            className="h-9 font-mono text-xs"
                            spellCheck={false}
                          />
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-xs",
                              !known ? "text-ink-2" : set ? "text-good" : "text-alert",
                            )}
                          >
                            {known ? (
                              set ? (
                                <Check className="size-3.5" aria-hidden />
                              ) : (
                                <X className="size-3.5" aria-hidden />
                              )
                            ) : null}
                            {!known ? t("callImportTokenAfterSave") : set ? t("secretSet") : t("secretMissing")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
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
                <Label htmlFor="call_import_voicemails" className="flex-col items-start gap-0.5 text-sm font-normal">
                  {t("callImportVoicemailsLabel")}
                  <span className="text-ink-2 text-xs">{t("callImportVoicemailsHint")}</span>
                </Label>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="call_import_lookback" className="flex-col items-start gap-0.5">
                  {t("callImportLookbackLabel")}
                  <span className="text-ink-2 text-xs font-normal">{t("callImportLookbackHint")}</span>
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
