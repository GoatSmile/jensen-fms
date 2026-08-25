"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { readPersonId } from "@/lib/auth/read-session";
import { createClient } from "@/lib/supabase/server";
import {
  TRANSCRIPTION_PROVIDERS,
  EXTRACTION_PROVIDERS,
  TELEPHONY_PROVIDERS,
  DEFAULT_EXTRACTION_MODEL,
  findProvider,
} from "@/lib/inbound/settings";

export type SettingsResult = { ok: true } | { ok: false; error: string };

export async function saveSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const t = await getTranslations("errors");
  const raw = nullable(formData.get("default_transport_pct"));
  if (!raw) {
    return { ok: false, error: t("adminSettingsTransportRequired") };
  }
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: t("adminSettingsTransportNumber") };
  }
  if (n < 0 || n > 1) {
    return {
      ok: false,
      error: t("adminSettingsTransportRange"),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      last_actor_id: await readPersonId(),
      default_transport_pct: n,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return {
      ok: false,
      error: t("adminSettingsCouldNotSave", { detail: error.message }),
    };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Save the location settings: the primary shop location (default target for
 * receiving + consumption) and whether to hide location information app-wide.
 * Revalidates the surfaces whose layout flexes on the hide flag — the parts
 * detail (stock + movements) and PO receiving routes — so the change shows
 * even on back-navigation to an already-visited page.
 */
/**
 * Save the communication settings: outbound email identity (from / reply-to),
 * the test-mode switch + test inbox list, and the workshop phone. These feed
 * the PO-to-supplier email and, later, the phone-call → ticket pipeline.
 * Light validation only — an address must contain "@"; the provider rejects
 * anything it can't actually send from.
 */
export async function saveCommunicationSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const t = await getTranslations("errors");
  const fromEmail = nullable(formData.get("outbound_from_email"));
  const replyToEmail = nullable(formData.get("outbound_reply_to_email"));
  const testEmail = nullable(formData.get("outbound_test_email"));
  const workshopPhone = nullable(formData.get("workshop_phone"));
  const testMode = formData.get("outbound_test_mode") === "on";

  for (const [label, value] of [
    [t("adminCommFromAddress"), fromEmail],
    [t("adminCommReplyToAddress"), replyToEmail],
  ] as const) {
    if (value && !value.includes("@")) {
      return { ok: false, error: t("adminCommNotEmail", { label }) };
    }
  }
  // The test field may hold several addresses (comma-separated) — every
  // piece must look like an email so a typo doesn't silently drop mail.
  if (testEmail) {
    const pieces = testEmail
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (pieces.length === 0 || pieces.some((p) => !p.includes("@"))) {
      return {
        ok: false,
        error: t("adminCommTestRecipients"),
      };
    }
  }
  if (testMode && !testEmail) {
    return {
      ok: false,
      error: t("adminCommTestModeNeedsRecipient"),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      last_actor_id: await readPersonId(),
      outbound_from_email: fromEmail,
      outbound_reply_to_email: replyToEmail,
      outbound_test_mode: testMode,
      outbound_test_email: testEmail,
      workshop_phone: workshopPhone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return {
      ok: false,
      error: t("adminSettingsCouldNotSave", { detail: error.message }),
    };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}

const DNS_RECORD_TYPES = ["TXT", "CNAME", "MX"] as const;
const DNS_RECORD_STATUSES = ["pending", "verified"] as const;

export type EmailDnsRecord = {
  type: (typeof DNS_RECORD_TYPES)[number];
  name: string;
  value: string;
  status: (typeof DNS_RECORD_STATUSES)[number];
  note: string;
};

/**
 * Save the sending domain + the reference copy of its DNS verification
 * records. The client serialises the record rows as JSON in `records`;
 * every row is re-validated here (type/status against the closed vocab,
 * name + value required) so a malformed payload can't land in the jsonb.
 * The authoritative records live at the DNS host — this is the paste-source
 * and status tracker until the provider API can report live status.
 */
export async function saveEmailDnsSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const t = await getTranslations("errors");
  const domain = nullable(formData.get("email_domain"));
  if (domain && !domain.includes(".")) {
    return { ok: false, error: t("adminDnsDomainInvalid") };
  }

  const rawRecords = nullable(formData.get("records"));
  let parsed: unknown;
  try {
    parsed = rawRecords ? JSON.parse(rawRecords) : [];
  } catch {
    return { ok: false, error: t("adminDnsCouldNotRead") };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: t("adminDnsPayloadList") };
  }
  const records: EmailDnsRecord[] = [];
  for (const r of parsed) {
    if (typeof r !== "object" || r === null) {
      return { ok: false, error: t("adminDnsMalformedRow") };
    }
    const row = r as Record<string, unknown>;
    const type = String(row.type ?? "");
    const status = String(row.status ?? "pending");
    const name = String(row.name ?? "").trim();
    const value = String(row.value ?? "").trim();
    const note = String(row.note ?? "").trim();
    if (name === "" && value === "") continue; // silently drop empty rows
    if (!(DNS_RECORD_TYPES as readonly string[]).includes(type)) {
      return { ok: false, error: t("adminDnsUnknownType", { type }) };
    }
    if (!(DNS_RECORD_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: t("adminDnsUnknownStatus", { status }) };
    }
    if (name === "" || value === "") {
      return {
        ok: false,
        error: t("adminDnsNameValueRequired"),
      };
    }
    records.push({
      type: type as EmailDnsRecord["type"],
      name,
      value,
      status: status as EmailDnsRecord["status"],
      note,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      last_actor_id: await readPersonId(),
      email_domain: domain,
      email_dns_records: records,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return {
      ok: false,
      error: t("adminSettingsCouldNotSave", { detail: error.message }),
    };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Save the working-language preferences: `app_language` (office/admin UI) and
 * `worker_language` (build-floor + ticket screens). Both constrained to en/da.
 * Captures the preference today; UI translation is a separate effort, and the
 * worker language becomes per-user later.
 */
export async function saveLanguageSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const t = await getTranslations("errors");
  const appLanguage = formData.get("app_language") === "da" ? "da" : "en";
  const workerLanguage = formData.get("worker_language") === "da" ? "da" : "en";

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      last_actor_id: await readPersonId(),
      app_language: appLanguage,
      worker_language: workerLanguage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return {
      ok: false,
      error: t("adminSettingsCouldNotSave", { detail: error.message }),
    };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Save the e-conomic accounting integration config. Numbers reference the
 * owner's e-conomic agreement (journal, chart-of-accounts, vocabularies) —
 * the "Test connection" action lists them so they can be copied here. The
 * API tokens are secrets and live in env vars, never here.
 */
export async function saveEconomicSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const t = await getTranslations("errors");
  const enabled = formData.get("economic_enabled") === "on";

  const intField = (
    name: string,
    label: string,
  ): { value: number | null } | { error: string } => {
    const raw = nullable(formData.get(name));
    if (!raw || raw.trim() === "") return { value: null };
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n < 0) {
      return { error: t("adminEconomicWholeNumber", { label }) };
    }
    return { value: n };
  };

  const journal = intField(
    "economic_journal_number",
    t("adminEconomicJournalNumber"),
  );
  if ("error" in journal) return { ok: false, error: journal.error };
  const revenue = intField(
    "economic_revenue_account",
    t("adminEconomicRevenueAccount"),
  );
  if ("error" in revenue) return { ok: false, error: revenue.error };
  const group = intField(
    "economic_customer_group",
    t("adminEconomicCustomerGroup"),
  );
  if ("error" in group) return { ok: false, error: group.error };
  const zone = intField("economic_vat_zone", t("adminEconomicVatZone"));
  if ("error" in zone) return { ok: false, error: zone.error };
  const terms = intField(
    "economic_payment_terms",
    t("adminEconomicPaymentTerms"),
  );
  if ("error" in terms) return { ok: false, error: terms.error };

  const vatCodeRaw = nullable(formData.get("economic_vat_code"));
  const vatCode =
    vatCodeRaw && vatCodeRaw.trim() !== "" ? vatCodeRaw.trim() : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      last_actor_id: await readPersonId(),
      economic_enabled: enabled,
      economic_journal_number: journal.value,
      economic_revenue_account: revenue.value,
      economic_vat_code: vatCode,
      economic_customer_group: group.value,
      economic_vat_zone: zone.value,
      economic_payment_terms: terms.value,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    return {
      ok: false,
      error: t("adminSettingsCouldNotSave", { detail: error.message }),
    };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Inbound-pipeline provider config (migration 66). Provider selection is
 * validated against the registries so a stored key always maps to a built
 * adapter; the provider API keys stay in env (this only touches non-secret
 * params + which adapter is active).
 */
export async function saveInboundSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const t = await getTranslations("errors");

  const pick = (
    field: string,
    registry: typeof TRANSCRIPTION_PROVIDERS,
    fallback: string,
  ): { value: string } | { error: string } => {
    const raw = (nullable(formData.get(field)) ?? fallback).trim();
    if (!findProvider(registry, raw)) {
      return { error: t("inboundUnknownProvider", { provider: raw }) };
    }
    return { value: raw };
  };

  const transcription = pick(
    "inbound_transcription_provider",
    TRANSCRIPTION_PROVIDERS,
    "azure",
  );
  if ("error" in transcription)
    return { ok: false, error: transcription.error };
  const extraction = pick(
    "inbound_extraction_provider",
    EXTRACTION_PROVIDERS,
    "anthropic",
  );
  if ("error" in extraction) return { ok: false, error: extraction.error };
  const telephony = pick(
    "inbound_telephony_provider",
    TELEPHONY_PROVIDERS,
    "twilio",
  );
  if ("error" in telephony) return { ok: false, error: telephony.error };

  const retentionRaw = (
    nullable(formData.get("inbound_media_retention_days")) ?? "90"
  ).trim();
  const retention = Number(retentionRaw);
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650) {
    return { ok: false, error: t("inboundRetentionRange") };
  }

  // Call handling (migration 78). Bridge mode is only meaningful with a number
  // to ring — refuse the half-configured state rather than silently answering
  // as voicemail and leaving the owner thinking calls are being forwarded.
  const callModeRaw = (
    nullable(formData.get("inbound_call_mode")) ?? "voicemail"
  ).trim();
  const callMode = callModeRaw === "bridge" ? "bridge" : "voicemail";
  const bridgeNumber = nullable(formData.get("inbound_bridge_number"));
  if (callMode === "bridge" && !bridgeNumber) {
    return { ok: false, error: t("inboundBridgeNumberRequired") };
  }
  const bridgeTimeout = Number(
    (nullable(formData.get("inbound_bridge_timeout_seconds")) ?? "20").trim(),
  );
  if (
    !Number.isInteger(bridgeTimeout) ||
    bridgeTimeout < 5 ||
    bridgeTimeout > 120
  ) {
    return { ok: false, error: t("inboundBridgeTimeoutRange") };
  }
  // The call-path transcription provider is optional (NULL = use the voicemail
  // provider), but when set it must map to a built adapter like the others.
  const callProviderRaw = nullable(
    formData.get("inbound_call_transcription_provider"),
  );
  if (
    callProviderRaw &&
    !findProvider(TRANSCRIPTION_PROVIDERS, callProviderRaw)
  ) {
    return {
      ok: false,
      error: t("inboundUnknownProvider", { provider: callProviderRaw }),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      last_actor_id: await readPersonId(),
      inbound_transcription_provider: transcription.value,
      inbound_transcription_region: nullable(
        formData.get("inbound_transcription_region"),
      ),
      inbound_extraction_provider: extraction.value,
      inbound_extraction_model:
        nullable(formData.get("inbound_extraction_model")) ??
        DEFAULT_EXTRACTION_MODEL,
      inbound_telephony_provider: telephony.value,
      inbound_phone_number: nullable(formData.get("inbound_phone_number")),
      inbound_phone_number_test: nullable(
        formData.get("inbound_phone_number_test"),
      ),
      inbound_media_retention_days: retention,
      inbound_shadow_mode: formData.get("inbound_shadow_mode") === "on",
      inbound_call_mode: callMode,
      inbound_bridge_number: bridgeNumber,
      inbound_bridge_timeout_seconds: bridgeTimeout,
      inbound_call_transcription_provider: callProviderRaw,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    return {
      ok: false,
      error: t("adminSettingsCouldNotSave", { detail: error.message }),
    };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
