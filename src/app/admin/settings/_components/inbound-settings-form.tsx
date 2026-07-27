"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appendField } from "@/lib/forms";
import { cn } from "@/lib/utils";

import { saveInboundSettings } from "../_actions/save-settings";
import { fetchModelOptions, testExtractionModel } from "../_actions/model-actions";
import type { ModelOption } from "@/lib/inbound/models";

type SecretStatus = { envVar: string; present: boolean };

type Props = {
  initialTranscriptionProvider: string;
  initialTranscriptionRegion: string;
  initialExtractionProvider: string;
  initialExtractionModel: string;
  initialTelephonyProvider: string;
  initialPhoneNumber: string;
  initialPhoneNumberTest: string;
  initialRetentionDays: string;
  initialShadowMode: boolean;
  initialCallMode: string;
  initialBridgeNumber: string;
  initialBridgeTimeout: string;
  initialCallTranscriptionProvider: string;
  transcriptionProviders: string[];
  extractionProviders: string[];
  telephonyProviders: string[];
  secrets: {
    transcription: SecretStatus[];
    extraction: SecretStatus[];
    telephony: SecretStatus[];
  };
};

/**
 * Inbound-pipeline provider config. Selects which built adapter runs each
 * capability + its non-secret params; the API keys are env secrets, shown
 * here only as ✓ Set / ✗ Missing so the owner knows what to add in Vercel
 * without the value ever reaching the browser.
 */
export function InboundSettingsForm(props: Props) {
  const t = useTranslations("adminSettings");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [transcriptionProvider, setTranscriptionProvider] = useState(
    props.initialTranscriptionProvider,
  );
  const [transcriptionRegion, setTranscriptionRegion] = useState(
    props.initialTranscriptionRegion,
  );
  const [extractionProvider, setExtractionProvider] = useState(
    props.initialExtractionProvider,
  );
  const [extractionModel, setExtractionModel] = useState(
    props.initialExtractionModel,
  );
  const [telephonyProvider, setTelephonyProvider] = useState(
    props.initialTelephonyProvider,
  );
  const [phoneNumber, setPhoneNumber] = useState(props.initialPhoneNumber);
  const [phoneNumberTest, setPhoneNumberTest] = useState(
    props.initialPhoneNumberTest,
  );
  const [retentionDays, setRetentionDays] = useState(props.initialRetentionDays);
  const [shadowMode, setShadowMode] = useState(props.initialShadowMode);
  // Call handling: voicemail (record a message) vs bridge (ring a real phone
  // and record the conversation) — docs/plan-live-call-recording.md.
  const [callMode, setCallMode] = useState(props.initialCallMode);
  const [bridgeNumber, setBridgeNumber] = useState(props.initialBridgeNumber);
  const [bridgeTimeout, setBridgeTimeout] = useState(props.initialBridgeTimeout);
  const [callProvider, setCallProvider] = useState(
    props.initialCallTranscriptionProvider,
  );
  // Absolute webhook URLs to paste into the Twilio number's config — they
  // depend on where this is deployed, so read the origin from the browser.
  // Voice: the "A call comes in" webhook. Status: the "Call status changes"
  // webhook, which captures every call (incl. hang-ups that leave no message).
  const [voiceWebhookUrl, setVoiceWebhookUrl] = useState("");
  const [statusWebhookUrl, setStatusWebhookUrl] = useState("");
  useEffect(() => {
    setVoiceWebhookUrl(`${window.location.origin}/api/inbound/twilio/voice`);
    setStatusWebhookUrl(`${window.location.origin}/api/inbound/twilio/status`);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function providerLabel(key: string): string {
    return t.has(`provider_${key}`) ? t(`provider_${key}`) : key;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.set("inbound_transcription_provider", transcriptionProvider);
    appendField(fd, "inbound_transcription_region", transcriptionRegion.trim());
    fd.set("inbound_extraction_provider", extractionProvider);
    appendField(fd, "inbound_extraction_model", extractionModel.trim());
    fd.set("inbound_telephony_provider", telephonyProvider);
    appendField(fd, "inbound_phone_number", phoneNumber.trim());
    appendField(fd, "inbound_phone_number_test", phoneNumberTest.trim());
    appendField(fd, "inbound_media_retention_days", retentionDays.trim());
    if (shadowMode) fd.set("inbound_shadow_mode", "on");
    fd.set("inbound_call_mode", callMode);
    appendField(fd, "inbound_bridge_number", bridgeNumber.trim());
    appendField(fd, "inbound_bridge_timeout_seconds", bridgeTimeout.trim());
    appendField(fd, "inbound_call_transcription_provider", callProvider.trim());
    start(async () => {
      const r = await saveInboundSettings(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(t("saved"));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Behaviour */}
      <div className="flex items-start gap-2">
        <input
          id="inbound_shadow_mode"
          type="checkbox"
          checked={shadowMode}
          onChange={(e) => setShadowMode(e.target.checked)}
          className="accent-primary mt-0.5 size-4"
        />
        <Label htmlFor="inbound_shadow_mode" className="text-sm font-normal">
          {t("inboundShadowLabel")}
          <span className="text-muted-foreground block text-xs">
            {t("inboundShadowHint")}
          </span>
        </Label>
      </div>

      <div className="divide-rule flex flex-col divide-y">
        <ProviderBlock
          title={t("inboundTranscriptionTitle")}
          providerId="inbound_transcription_provider"
          provider={transcriptionProvider}
          onProvider={setTranscriptionProvider}
          options={props.transcriptionProviders}
          providerLabel={providerLabel}
          secrets={props.secrets.transcription}
        >
          {/* Region is an Azure-shaped param; Gladia needs none. */}
          {transcriptionProvider === "azure" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inbound_transcription_region">
                {t("inboundRegionLabel")}
              </Label>
              <Input
                id="inbound_transcription_region"
                value={transcriptionRegion}
                onChange={(e) => setTranscriptionRegion(e.target.value)}
                placeholder="westeurope"
              />
            </div>
          ) : null}
        </ProviderBlock>

        <ProviderBlock
          title={t("inboundExtractionTitle")}
          providerId="inbound_extraction_provider"
          provider={extractionProvider}
          onProvider={setExtractionProvider}
          options={props.extractionProviders}
          providerLabel={providerLabel}
          secrets={props.secrets.extraction}
        >
          <ModelField
            provider={extractionProvider}
            value={extractionModel}
            onChange={setExtractionModel}
          />
        </ProviderBlock>

        <ProviderBlock
          title={t("inboundTelephonyTitle")}
          providerId="inbound_telephony_provider"
          provider={telephonyProvider}
          onProvider={setTelephonyProvider}
          options={props.telephonyProviders}
          providerLabel={providerLabel}
          secrets={props.secrets.telephony}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inbound_phone_number" className="flex-col items-start gap-0.5">
              {t("inboundPhoneLabel")}
              <span className="text-ink-2 text-xs font-normal">
                {t("inboundPhoneHint")}
              </span>
            </Label>
            <Input
              id="inbound_phone_number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+45 …"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inbound_phone_number_test" className="flex-col items-start gap-0.5">
              {t("inboundPhoneTestLabel")}
              <span className="text-ink-2 text-xs font-normal">
                {t("inboundPhoneTestHint")}
              </span>
            </Label>
            <Input
              id="inbound_phone_number_test"
              value={phoneNumberTest}
              onChange={(e) => setPhoneNumberTest(e.target.value)}
              placeholder="+1 …"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inbound_media_retention_days">
              {t("inboundRetentionLabel")}
            </Label>
            <Input
              id="inbound_media_retention_days"
              inputMode="numeric"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              placeholder="90"
            />
          </div>
          {/* Call handling — the switch that decides what a caller reaches.
              Bridge mode is inert without a number, so the number field is
              required-with-reason rather than hidden. */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="inbound_call_mode" className="flex-col items-start gap-0.5">
              {t("inboundCallModeLabel")}
              <span className="text-ink-2 text-xs font-normal">
                {t("inboundCallModeHint")}
              </span>
            </Label>
            <select
              id="inbound_call_mode"
              value={callMode}
              onChange={(e) => setCallMode(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm sm:max-w-sm"
            >
              <option value="voicemail">{t("inboundCallModeVoicemail")}</option>
              <option value="bridge">{t("inboundCallModeBridge")}</option>
            </select>
          </div>
          {callMode === "bridge" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inbound_bridge_number" className="flex-col items-start gap-0.5">
                  {t("inboundBridgeNumberLabel")}
                  <span className="text-ink-2 text-xs font-normal">
                    {t("inboundBridgeNumberHint")}
                  </span>
                </Label>
                <Input
                  id="inbound_bridge_number"
                  value={bridgeNumber}
                  onChange={(e) => setBridgeNumber(e.target.value)}
                  placeholder="+45 …"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inbound_bridge_timeout_seconds" className="flex-col items-start gap-0.5">
                  {t("inboundBridgeTimeoutLabel")}
                  <span className="text-ink-2 text-xs font-normal">
                    {t("inboundBridgeTimeoutHint")}
                  </span>
                </Label>
                <Input
                  id="inbound_bridge_timeout_seconds"
                  inputMode="numeric"
                  value={bridgeTimeout}
                  onChange={(e) => setBridgeTimeout(e.target.value)}
                  placeholder="20"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="inbound_call_transcription_provider" className="flex-col items-start gap-0.5">
                  {t("inboundCallProviderLabel")}
                  <span className="text-ink-2 text-xs font-normal">
                    {t("inboundCallProviderHint")}
                  </span>
                </Label>
                <select
                  id="inbound_call_transcription_provider"
                  value={callProvider}
                  onChange={(e) => setCallProvider(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm sm:max-w-sm"
                >
                  <option value="">{t("inboundCallProviderSame")}</option>
                  {props.transcriptionProviders.map((p) => (
                    <option key={p} value={p}>
                      {providerLabel(p)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          {telephonyProvider === "twilio" ? (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <p className="text-muted-foreground text-xs">
                {t("inboundWebhookHint")}{" "}
                <code className="font-mono break-all">
                  {voiceWebhookUrl || "…"}
                </code>
              </p>
              <p className="text-muted-foreground text-xs">
                {t("inboundStatusWebhookHint")}{" "}
                <code className="font-mono break-all">
                  {statusWebhookUrl || "…"}
                </code>
              </p>
            </div>
          ) : null}
        </ProviderBlock>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tCommon("saving") : t("saveInbound")}
        </Button>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {success ? (
          <p
            className="text-sm text-good"
            role="status"
          >
            {success}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Model picker — pick from the live catalogue, or type an id.
 *
 * Both halves are load-bearing. The LIST (Models API, ./models.ts) means a new
 * model is selectable the day it ships with no code change, and that nobody
 * has to transcribe an id from the docs. FREE TEXT means discovery being down
 * — no key, offline, a provider with no catalogue endpoint — can never block
 * saving an id the admin knows is right. Discovery is an aid, not a gate.
 *
 * The saved value is always offered as an option even when the catalogue does
 * not list it: a <select> whose value has no matching <option> renders blank
 * and would silently overwrite the stored model on the next change.
 */
function ModelField({
  provider,
  value,
  onChange,
}: {
  provider: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("adminSettings");
  // One state object stamped with the provider it describes, so "loading" is
  // DERIVED from whether we hold a result for the current provider rather than
  // being a flag an effect has to reset synchronously on every change.
  const [loaded, setLoaded] = useState<{
    provider: string;
    models: ModelOption[];
    error: string | null;
  } | null>(null);
  const [manual, setManual] = useState(false);
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const fresh = loaded?.provider === provider ? loaded : null;
  const loading = fresh === null;
  const models = fresh?.models ?? [];
  const listError = fresh?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    fetchModelOptions(provider).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setLoaded({ provider, models: r.models, error: null });
      } else {
        // Discovery failed — fall back to free text rather than trapping the
        // admin behind an empty dropdown.
        setLoaded({ provider, models: [], error: r.error });
        setManual(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const listed = models.some((m) => m.id === value);
  const selected = models.find((m) => m.id === value) ?? null;

  function runTest() {
    setTestResult(null);
    startTest(async () => {
      const r = await testExtractionModel(provider, value);
      setTestResult(r.ok ? { ok: true, text: t("inboundModelOk") } : { ok: false, text: r.error });
    });
  }

  function update(next: string) {
    setTestResult(null);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor="inbound_extraction_model" className="flex-col items-start gap-0.5">
        {t("inboundModelLabel")}
        <span className="text-ink-2 text-xs font-normal">
          {t("inboundModelHint")}
        </span>
      </Label>

      <div className="flex flex-wrap items-center gap-2">
        {manual ? (
          <Input
            id="inbound_extraction_model"
            value={value}
            onChange={(e) => update(e.target.value)}
            placeholder="claude-sonnet-5"
            className="font-mono sm:max-w-sm"
          />
        ) : (
          <select
            id="inbound_extraction_model"
            value={value}
            onChange={(e) => update(e.target.value)}
            disabled={loading}
            className="border-input bg-background h-9 w-full rounded-md border px-2 font-mono text-sm sm:max-w-sm"
          >
            {loading ? <option value={value}>{t("inboundModelLoading")}</option> : null}
            {!loading && !listed ? (
              <option value={value}>
                {value || "—"} {t("inboundModelUnlisted")}
              </option>
            ) : null}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} — {m.id}
                {m.isAlias ? "" : ` ${t("inboundModelSnapshot")}`}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setManual((v) => !v)}
          className="text-muted-foreground text-xs underline"
        >
          {manual ? t("inboundModelUseList") : t("inboundModelTypeIt")}
        </button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={runTest}
          disabled={testing || !value.trim()}
        >
          {testing ? t("inboundModelTesting") : t("inboundModelTest")}
        </Button>
      </div>

      {selected?.maxInputTokens ? (
        <p className="text-muted-foreground text-xs">
          {t("inboundModelContext", {
            input: Math.round(selected.maxInputTokens / 1000),
            output: Math.round((selected.maxTokens ?? 0) / 1000),
          })}
        </p>
      ) : null}

      {!loading && !listed && value.trim() && !manual ? (
        <p className="text-xs text-money">
          {t("inboundModelUnlistedHint")}
        </p>
      ) : null}

      {listError ? <p className="text-muted-foreground text-xs">{listError}</p> : null}

      {testResult ? (
        <p
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            testResult.ok
              ? "text-good"
              : "text-destructive",
          )}
          role="status"
        >
          {testResult.ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
          {testResult.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One capability of the inbound pipeline — transcription, extraction,
 * telephony — as a SUMMARY ROW that expands on demand (plan §9).
 *
 * Collapsed it answers the only question this page is usually opened with:
 * which adapter is running, and are its secrets in place. The 13 inputs
 * behind these three rows are provider params, changed a handful of times a
 * year. A row that reports a missing secret starts open, because that is the
 * one state the admin came here to fix.
 *
 * Not a bordered card: the rows are a run inside the panel, separated by
 * hairlines. The expanded body sits on `bg-surface` — the panel is hued, and
 * inner content on a wash is what CLAUDE.md's tinting rule asks for.
 */
function ProviderBlock({
  title,
  providerId,
  provider,
  onProvider,
  options,
  providerLabel,
  secrets,
  children,
}: {
  title: string;
  providerId: string;
  provider: string;
  onProvider: (v: string) => void;
  options: string[];
  providerLabel: (key: string) => string;
  secrets: SecretStatus[];
  children: React.ReactNode;
}) {
  const t = useTranslations("adminSettings");
  const missing = secrets.filter((s) => !s.present);
  const [open, setOpen] = useState(missing.length > 0);

  return (
    <div className="py-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-1 text-left"
      >
        <ChevronRight
          className={cn(
            "text-ink-3 size-3.5 shrink-0 transition-transform",
            open ? "rotate-90" : "",
          )}
          aria-hidden
        />
        <span className="text-sm font-medium">{title}</span>
        <span className="text-ink-2 truncate text-sm">
          {providerLabel(provider)}
        </span>
        <span
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-1 text-xs",
            missing.length > 0 ? "text-alert" : "text-good",
          )}
        >
          {missing.length > 0 ? (
            <X className="size-3.5" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          {missing.length > 0
            ? t("inboundBlockMissing", { count: missing.length })
            : t("inboundBlockReady")}
        </span>
      </button>

      {open ? (
        <div className="bg-surface mt-2 flex flex-col gap-3 rounded-lg p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={providerId}>{t("providerLabel")}</Label>
              <select
                id={providerId}
                value={provider}
                onChange={(e) => onProvider(e.target.value)}
                className="border-rule bg-ground h-9 rounded-md border px-2 text-sm"
              >
                {options.map((key) => (
                  <option key={key} value={key}>
                    {providerLabel(key)}
                  </option>
                ))}
              </select>
            </div>
            {children}
          </div>
          {secrets.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {secrets.map((s) => (
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
