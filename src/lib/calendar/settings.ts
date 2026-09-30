/**
 * The service-visits calendar's configuration (migration 117; three-tier
 * doctrine). WHICH provider and WHICH calendar are operational config in
 * `app_settings`, edited at /admin/settings → Calendar. The key is a secret
 * and lives only in env; the admin card shows it as present/missing, plus the
 * service account's address, which is read from the key because a second copy
 * could only ever disagree with it.
 *
 * Swappable capability, registry pattern: a provider is an adapter behind
 * `CalendarAdapter` (./client.ts). Config selects an adapter that exists; it
 * cannot conjure one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProviderEntry } from "@/lib/inbound/settings";

export const CALENDAR_PROVIDERS: ProviderEntry[] = [
  { key: "google", envSecrets: ["GOOGLE_SERVICE_ACCOUNT_KEY"] },
];

/** Every visit lives on Danish time, whatever the server's clock says. */
export const CALENDAR_TIME_ZONE = "Europe/Copenhagen";

export type CalendarSettings = {
  /** Null = off. */
  provider: string | null;
  calendarId: string | null;
};

export async function loadCalendarSettings(supabase: SupabaseClient): Promise<CalendarSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("calendar_provider, calendar_id")
    .eq("id", 1)
    .maybeSingle();
  const provider = CALENDAR_PROVIDERS.some((p) => p.key === data?.calendar_provider)
    ? (data?.calendar_provider as string)
    : null;
  const calendarId = (data?.calendar_id as string | null)?.trim() || null;
  return { provider, calendarId };
}

/** On, with a calendar named — what every reader and writer checks first. */
export function calendarReady(s: CalendarSettings): s is { provider: string; calendarId: string } {
  return Boolean(s.provider && s.calendarId);
}

export type CalendarSecretStatus = {
  envVar: string;
  present: boolean;
  /** The service account's address, from the key — never the key itself. */
  accountEmail: string | null;
};

/** SERVER-ONLY. Present/missing for the provider's secret, and whose it is. */
export function calendarSecretStatus(provider: string): CalendarSecretStatus[] {
  const entry = CALENDAR_PROVIDERS.find((p) => p.key === provider);
  if (!entry) return [];
  return entry.envSecrets.map((envVar) => {
    const raw = process.env[envVar];
    let accountEmail: string | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { client_email?: unknown };
        accountEmail = typeof parsed.client_email === "string" ? parsed.client_email : null;
      } catch {
        accountEmail = null;
      }
    }
    return { envVar, present: Boolean(raw), accountEmail };
  });
}
