"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SettingsResult = { ok: true } | { ok: false; error: string };

export async function saveSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const raw = nullable(formData.get("default_transport_pct"));
  if (!raw) {
    return { ok: false, error: "Default transport % is required." };
  }
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Default transport % must be a number." };
  }
  if (n < 0 || n > 1) {
    return {
      ok: false,
      error: "Default transport % must be between 0 and 1 (decimal — 0.10 = 10 %).",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      default_transport_pct: n,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return { ok: false, error: `Could not save settings: ${error.message}` };
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
  const fromEmail = nullable(formData.get("outbound_from_email"));
  const replyToEmail = nullable(formData.get("outbound_reply_to_email"));
  const testEmail = nullable(formData.get("outbound_test_email"));
  const workshopPhone = nullable(formData.get("workshop_phone"));
  const testMode = formData.get("outbound_test_mode") === "on";

  for (const [label, value] of [
    ["From address", fromEmail],
    ["Reply-to address", replyToEmail],
  ] as const) {
    if (value && !value.includes("@")) {
      return { ok: false, error: `${label} does not look like an email.` };
    }
  }
  // The test field may hold several addresses (comma-separated) — every
  // piece must look like an email so a typo doesn't silently drop mail.
  if (testEmail) {
    const pieces = testEmail.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    if (pieces.length === 0 || pieces.some((p) => !p.includes("@"))) {
      return {
        ok: false,
        error: "Test recipients must be one or more emails, comma-separated.",
      };
    }
  }
  if (testMode && !testEmail) {
    return {
      ok: false,
      error: "Test mode needs at least one test recipient.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      outbound_from_email: fromEmail,
      outbound_reply_to_email: replyToEmail,
      outbound_test_mode: testMode,
      outbound_test_email: testEmail,
      workshop_phone: workshopPhone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return { ok: false, error: `Could not save settings: ${error.message}` };
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
  const domain = nullable(formData.get("email_domain"));
  if (domain && !domain.includes(".")) {
    return { ok: false, error: "Domain does not look like a domain name." };
  }

  const rawRecords = nullable(formData.get("records"));
  let parsed: unknown;
  try {
    parsed = rawRecords ? JSON.parse(rawRecords) : [];
  } catch {
    return { ok: false, error: "Could not read the DNS records payload." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "DNS records payload must be a list." };
  }
  const records: EmailDnsRecord[] = [];
  for (const r of parsed) {
    if (typeof r !== "object" || r === null) {
      return { ok: false, error: "Malformed DNS record row." };
    }
    const row = r as Record<string, unknown>;
    const type = String(row.type ?? "");
    const status = String(row.status ?? "pending");
    const name = String(row.name ?? "").trim();
    const value = String(row.value ?? "").trim();
    const note = String(row.note ?? "").trim();
    if (name === "" && value === "") continue; // silently drop empty rows
    if (!(DNS_RECORD_TYPES as readonly string[]).includes(type)) {
      return { ok: false, error: `Unknown record type "${type}".` };
    }
    if (!(DNS_RECORD_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: `Unknown record status "${status}".` };
    }
    if (name === "" || value === "") {
      return {
        ok: false,
        error: "Every DNS record needs both a name and a value.",
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
      email_domain: domain,
      email_dns_records: records,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return { ok: false, error: `Could not save settings: ${error.message}` };
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
  const appLanguage = formData.get("app_language") === "da" ? "da" : "en";
  const workerLanguage = formData.get("worker_language") === "da" ? "da" : "en";

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      app_language: appLanguage,
      worker_language: workerLanguage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return { ok: false, error: `Could not save settings: ${error.message}` };
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
  const enabled = formData.get("economic_enabled") === "on";

  const intField = (
    name: string,
    label: string,
  ): { value: number | null } | { error: string } => {
    const raw = nullable(formData.get(name));
    if (!raw || raw.trim() === "") return { value: null };
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n < 0) {
      return { error: `${label} must be a whole number.` };
    }
    return { value: n };
  };

  const journal = intField("economic_journal_number", "Journal number");
  if ("error" in journal) return { ok: false, error: journal.error };
  const revenue = intField("economic_revenue_account", "Revenue account");
  if ("error" in revenue) return { ok: false, error: revenue.error };
  const group = intField("economic_customer_group", "Customer group");
  if ("error" in group) return { ok: false, error: group.error };
  const zone = intField("economic_vat_zone", "VAT zone");
  if ("error" in zone) return { ok: false, error: zone.error };
  const terms = intField("economic_payment_terms", "Payment terms");
  if ("error" in terms) return { ok: false, error: terms.error };

  const vatCodeRaw = nullable(formData.get("economic_vat_code"));
  const vatCode = vatCodeRaw && vatCodeRaw.trim() !== "" ? vatCodeRaw.trim() : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
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
    return { ok: false, error: `Could not save settings: ${error.message}` };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
