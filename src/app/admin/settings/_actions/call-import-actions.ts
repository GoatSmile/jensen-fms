"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import {
  callImportAdapter,
  missingCallImportSecrets,
} from "@/lib/inbound/call-import/import";
import type { CallEndpoint } from "@/lib/inbound/call-import/types";
import { createClient } from "@/lib/supabase/server";

import type { SettingsResult } from "./save-settings";

export type EndpointListResult =
  | { ok: true; endpoints: CallEndpoint[] }
  | { ok: false; error: string };

/**
 * The provider's live list of people whose calls can be imported — what the
 * "Import calls for" checkboxes are drawn from, so an endpoint id is picked,
 * never typed. Loading it is also the connection test: a refused token shows
 * here, on the settings page, rather than in a job log.
 */
export async function listCallImportEndpoints(
  provider: string,
): Promise<EndpointListResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("admin"))) {
    return { ok: false, error: t("callImportNeedsAdmin") };
  }
  const adapter = callImportAdapter(provider);
  if (!adapter) return { ok: false, error: t("inboundUnknownProvider", { provider }) };
  const missing = missingCallImportSecrets(provider);
  if (missing.length > 0) {
    return { ok: false, error: t("callImportMissingSecret", { names: missing.join(", ") }) };
  }
  const r = await adapter.listEndpoints();
  return r.ok
    ? { ok: true, endpoints: r.value }
    : { ok: false, error: t("callImportProviderError", { detail: r.error }) };
}

/**
 * Call-import config (migration 111). The token stays in env (RELATEL_TOKEN);
 * this stores which adapter runs, whose calls, voicemails yes/no and how far
 * back each run looks. Endpoints are re-checked against the provider's live
 * list when it can be read, so a stale id cannot be saved by a crafted form.
 */
export async function saveCallImportSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("admin"))) {
    return { ok: false, error: t("callImportNeedsAdmin") };
  }

  const providerRaw = String(formData.get("provider") ?? "").trim();
  const provider = providerRaw || null;
  if (provider && !callImportAdapter(provider)) {
    return { ok: false, error: t("inboundUnknownProvider", { provider }) };
  }

  const endpoints = [
    ...new Set(
      formData
        .getAll("endpoints")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ];
  if (provider && endpoints.length > 0 && missingCallImportSecrets(provider).length === 0) {
    const live = await callImportAdapter(provider)!.listEndpoints();
    if (live.ok) {
      const known = new Set(live.value.map((e) => e.id));
      const unknown = endpoints.filter((e) => !known.has(e));
      if (unknown.length > 0) {
        return { ok: false, error: t("callImportUnknownEndpoint", { ids: unknown.join(", ") }) };
      }
    }
  }
  if (provider && endpoints.length === 0) {
    return { ok: false, error: t("callImportNeedsEndpoint") };
  }

  const lookback = Number(String(formData.get("lookback_hours") ?? "48").trim());
  if (!Number.isInteger(lookback) || lookback < 1 || lookback > 336) {
    return { ok: false, error: t("callImportLookbackRange") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      last_actor_id: await readPersonId(),
      inbound_call_import_provider: provider,
      inbound_call_import_endpoints: endpoints,
      inbound_call_import_voicemails: formData.get("voicemails") === "on",
      inbound_call_import_lookback_hours: lookback,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    return { ok: false, error: t("adminSettingsCouldNotSave", { detail: error.message }) };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}
