import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CALL_IMPORT_PROVIDERS, findProvider } from "@/lib/inbound/settings";

/**
 * Phone lines (migration 112): which provider lines are imported, and whose
 * calls they are. The ONE place that turns a line into a token — every reader
 * of a line's secret goes through `readLineToken`, which refuses any env name
 * outside the provider's pattern even if one reached the database.
 */
export type PhoneLine = {
  id: string;
  provider: string;
  endpoint: string;
  endpoint_name: string | null;
  line_number: string | null;
  person_id: string | null;
  label: string | null;
  token_env: string;
  import_enabled: boolean;
};

const COLUMNS =
  "id, provider, endpoint, endpoint_name, line_number, person_id, label, token_env, import_enabled";

export async function loadPhoneLines(
  supabase: SupabaseClient,
  opts: { provider?: string; importingOnly?: boolean } = {},
): Promise<PhoneLine[]> {
  let q = supabase.from("phone_lines").select(COLUMNS).order("endpoint_name");
  if (opts.provider) q = q.eq("provider", opts.provider);
  if (opts.importingOnly) q = q.eq("import_enabled", true);
  const { data } = await q;
  return (data ?? []) as PhoneLine[];
}

/** Is `env` an allowed token variable name for this provider? */
export function isAllowedTokenEnv(provider: string, env: string): boolean {
  const entry = findProvider(CALL_IMPORT_PROVIDERS, provider);
  return !!entry?.lineToken && entry.lineToken.pattern.test(env);
}

export function defaultTokenEnv(provider: string): string | null {
  return findProvider(CALL_IMPORT_PROVIDERS, provider)?.lineToken?.defaultEnv ?? null;
}

/** The token value for a line's env name — null if the name is not allowed or unset. */
export function readTokenEnv(provider: string, env: string): string | null {
  if (!isAllowedTokenEnv(provider, env)) return null;
  return process.env[env]?.trim() || null;
}

export function readLineToken(line: Pick<PhoneLine, "provider" | "token_env">): string | null {
  return readTokenEnv(line.provider, line.token_env);
}

/** Present/missing per distinct token name — for the admin table. Never the value. */
export function tokenStatus(provider: string, envs: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const env of new Set(envs)) out[env] = readTokenEnv(provider, env) !== null;
  return out;
}

/**
 * "+4529431043" → "+45 29 43 10 43" for display; anything else unchanged.
 * Danish numbers are eight digits read in pairs; the stored value stays E.164.
 */
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.replace(/\s/g, "").match(/^\+45(\d{8})$/);
  return m ? `+45 ${m[1].replace(/(\d{2})(?=\d)/g, "$1 ")}` : raw;
}

/** Digits-only tail used to compare phone numbers across formats. */
export function numberTail(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : null;
}
