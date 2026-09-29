"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import {
  defaultTokenEnv,
  isAllowedTokenEnv,
  loadPhoneLines,
  readTokenEnv,
} from "@/lib/calls/lines";
import { callImportAdapter } from "@/lib/inbound/call-import/import";
import type { CallEndpoint } from "@/lib/inbound/call-import/types";
import { createClient } from "@/lib/supabase/server";

import type { SettingsResult } from "./save-settings";

export type EndpointListResult =
  | { ok: true; endpoints: CallEndpoint[] }
  | { ok: false; error: string };

/**
 * A token that can READ the provider's employee directory — any line's will
 * do (the directory is company-wide; only recordings are per person). The
 * default name first, then whichever line's token is set.
 */
async function directoryToken(provider: string): Promise<string | null> {
  const def = defaultTokenEnv(provider);
  const fromDefault = def ? readTokenEnv(provider, def) : null;
  if (fromDefault) return fromDefault;
  const supabase = await createClient();
  for (const l of await loadPhoneLines(supabase, { provider })) {
    const v = readTokenEnv(provider, l.token_env);
    if (v) return v;
  }
  return null;
}

/**
 * The provider's live list of lines — what the phone-lines table is drawn
 * from, so an endpoint id is picked, never typed. Loading it is also the
 * connection test: a refused token shows on the settings page, not in a log.
 */
export async function listCallImportEndpoints(provider: string): Promise<EndpointListResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("admin"))) return { ok: false, error: t("callImportNeedsAdmin") };
  const adapter = callImportAdapter(provider);
  if (!adapter) return { ok: false, error: t("inboundUnknownProvider", { provider }) };
  const token = await directoryToken(provider);
  if (!token) {
    return {
      ok: false,
      error: t("callImportMissingSecret", { names: defaultTokenEnv(provider) ?? provider }),
    };
  }
  const r = await adapter.listEndpoints(token);
  return r.ok
    ? { ok: true, endpoints: r.value }
    : { ok: false, error: t("callImportProviderError", { detail: r.error }) };
}

type LineInput = {
  endpoint: string;
  endpoint_name: string | null;
  line_number: string | null;
  person_id: string | null;
  label: string | null;
  token_env: string;
  import_enabled: boolean;
};

function parseLines(raw: unknown): LineInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: LineInput[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) return null;
    const o = r as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const endpoint = s(o.endpoint);
    if (!endpoint) return null;
    out.push({
      endpoint,
      endpoint_name: s(o.endpoint_name),
      line_number: s(o.line_number),
      person_id: s(o.person_id),
      label: s(o.label),
      token_env: s(o.token_env) ?? "",
      import_enabled: o.import_enabled === true,
    });
  }
  return out;
}

/**
 * Call import (migrations 111 + 112): which adapter runs, voicemails, the
 * lookback, and the phone lines — each mapped to a person (or a labelled
 * shared line) and to the env var holding its token. Validated here, not
 * trusted from the form: the token name against the provider's pattern (the
 * DB checks it too), the person against active people, the endpoint against
 * the provider's live list when it can be read. Lines are never deleted —
 * calls point at them — only switched off.
 */
export async function saveCallImportSettings(formData: FormData): Promise<SettingsResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("admin"))) return { ok: false, error: t("callImportNeedsAdmin") };

  const provider = String(formData.get("provider") ?? "").trim() || null;
  if (provider && !callImportAdapter(provider)) {
    return { ok: false, error: t("inboundUnknownProvider", { provider }) };
  }
  const lookback = Number(String(formData.get("lookback_hours") ?? "48").trim());
  if (!Number.isInteger(lookback) || lookback < 1 || lookback > 336) {
    return { ok: false, error: t("callImportLookbackRange") };
  }

  let lines: LineInput[] | null = [];
  try {
    lines = parseLines(JSON.parse(String(formData.get("lines") ?? "[]")));
  } catch {
    lines = null;
  }
  if (!lines) return { ok: false, error: t("callImportBadLines") };

  const supabase = await createClient();
  const lineProvider = provider ?? "relatel";

  if (lines.length > 0) {
    // Person ids must be real, active, non-system people.
    const personIds = [...new Set(lines.map((l) => l.person_id).filter((v): v is string => !!v))];
    if (personIds.length > 0) {
      const { data: people } = await supabase
        .from("people")
        .select("id")
        .in("id", personIds)
        .eq("is_active", true)
        .eq("is_system", false);
      const ok = new Set((people ?? []).map((p) => p.id));
      if (personIds.some((id) => !ok.has(id))) return { ok: false, error: t("callImportUnknownPerson") };
    }
    for (const l of lines) {
      if (!isAllowedTokenEnv(lineProvider, l.token_env)) {
        return { ok: false, error: t("callImportBadTokenEnv", { name: l.token_env || "—" }) };
      }
      if (!l.person_id && !l.label) {
        return { ok: false, error: t("callImportSharedNeedsLabel", { line: l.endpoint_name ?? l.endpoint }) };
      }
    }
    // Endpoints must be ones the provider lists (or lines we already hold,
    // which may have left the provider and are being switched off).
    const existing = new Set((await loadPhoneLines(supabase, { provider: lineProvider })).map((l) => l.endpoint));
    const adapter = callImportAdapter(lineProvider);
    const token = adapter ? await directoryToken(lineProvider) : null;
    if (adapter && token) {
      const live = await adapter.listEndpoints(token);
      if (live.ok) {
        const known = new Set(live.value.map((e) => e.id));
        const unknown = lines.filter((l) => !known.has(l.endpoint) && !existing.has(l.endpoint));
        if (unknown.length > 0) {
          return { ok: false, error: t("callImportUnknownEndpoint", { ids: unknown.map((l) => l.endpoint).join(", ") }) };
        }
      }
    }
  }

  if (provider && !lines.some((l) => l.import_enabled)) {
    return { ok: false, error: t("callImportNeedsEndpoint") };
  }

  const actor = await readPersonId();
  const now = new Date().toISOString();
  if (lines.length > 0) {
    const { error: lineErr } = await supabase.from("phone_lines").upsert(
      lines.map((l) => ({
        provider: lineProvider,
        endpoint: l.endpoint,
        endpoint_name: l.endpoint_name,
        line_number: l.line_number,
        person_id: l.person_id,
        label: l.person_id ? null : l.label,
        token_env: l.token_env,
        import_enabled: l.import_enabled,
        last_actor_id: actor,
        updated_at: now,
      })),
      { onConflict: "provider,endpoint" },
    );
    if (lineErr) return { ok: false, error: t("adminSettingsCouldNotSave", { detail: lineErr.message }) };
  }

  const { error } = await supabase
    .from("app_settings")
    .update({
      last_actor_id: actor,
      inbound_call_import_provider: provider,
      inbound_call_import_voicemails: formData.get("voicemails") === "on",
      inbound_call_import_lookback_hours: lookback,
      updated_at: now,
    })
    .eq("id", 1);
  if (error) return { ok: false, error: t("adminSettingsCouldNotSave", { detail: error.message }) };

  revalidatePath("/admin/settings");
  revalidatePath("/calls");
  return { ok: true };
}
