"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appendField } from "@/lib/forms";
import { cn } from "@/lib/utils";

import { saveInboundSettings } from "../_actions/save-settings";

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

      <ProviderBlock
        title={t("inboundTranscriptionTitle")}
        providerId="inbound_transcription_provider"
        providerLabelText={t("providerLabel")}
        provider={transcriptionProvider}
        onProvider={setTranscriptionProvider}
        options={props.transcriptionProviders}
        providerLabel={providerLabel}
        secrets={props.secrets.transcription}
        secretSetText={t("secretSet")}
        secretMissingText={t("secretMissing")}
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
        providerLabelText={t("providerLabel")}
        provider={extractionProvider}
        onProvider={setExtractionProvider}
        options={props.extractionProviders}
        providerLabel={providerLabel}
        secrets={props.secrets.extraction}
        secretSetText={t("secretSet")}
        secretMissingText={t("secretMissing")}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inbound_extraction_model">
            {t("inboundModelLabel")}
          </Label>
          <Input
            id="inbound_extraction_model"
            value={extractionModel}
            onChange={(e) => setExtractionModel(e.target.value)}
            placeholder="claude-haiku-4-5-20251001"
            className="font-mono"
          />
        </div>
      </ProviderBlock>

      <ProviderBlock
        title={t("inboundTelephonyTitle")}
        providerId="inbound_telephony_provider"
        providerLabelText={t("providerLabel")}
        provider={telephonyProvider}
        onProvider={setTelephonyProvider}
        options={props.telephonyProviders}
        providerLabel={providerLabel}
        secrets={props.secrets.telephony}
        secretSetText={t("secretSet")}
        secretMissingText={t("secretMissing")}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inbound_phone_number">
            {t("inboundPhoneLabel")}
            <span className="text-muted-foreground block text-xs font-normal">
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
          <Label htmlFor="inbound_phone_number_test">
            {t("inboundPhoneTestLabel")}
            <span className="text-muted-foreground block text-xs font-normal">
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
          <Label htmlFor="inbound_call_mode">
            {t("inboundCallModeLabel")}
            <span className="text-muted-foreground block text-xs font-normal">
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
              <Label htmlFor="inbound_bridge_number">
                {t("inboundBridgeNumberLabel")}
                <span className="text-muted-foreground block text-xs font-normal">
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
              <Label htmlFor="inbound_bridge_timeout_seconds">
                {t("inboundBridgeTimeoutLabel")}
                <span className="text-muted-foreground block text-xs font-normal">
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
              <Label htmlFor="inbound_call_transcription_provider">
                {t("inboundCallProviderLabel")}
                <span className="text-muted-foreground block text-xs font-normal">
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tCommon("saving") : t("saveInbound")}
        </Button>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {success ? (
          <p
            className="text-sm text-emerald-700 dark:text-emerald-400"
            role="status"
          >
            {success}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function ProviderBlock({
  title,
  providerId,
  providerLabelText,
  provider,
  onProvider,
  options,
  providerLabel,
  secrets,
  secretSetText,
  secretMissingText,
  children,
}: {
  title: string;
  providerId: string;
  providerLabelText: string;
  provider: string;
  onProvider: (v: string) => void;
  options: string[];
  providerLabel: (key: string) => string;
  secrets: SecretStatus[];
  secretSetText: string;
  secretMissingText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={providerId}>{providerLabelText}</Label>
          <select
            id={providerId}
            value={provider}
            onChange={(e) => onProvider(e.target.value)}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
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
                s.present
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-amber-700 dark:text-amber-500",
              )}
            >
              {s.present ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              <span className="font-mono">{s.envVar}</span>
              <span>{s.present ? secretSetText : secretMissingText}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
