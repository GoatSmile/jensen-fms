"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { calendarAdapter } from "@/lib/calendar/client";
import { CALENDAR_PROVIDERS } from "@/lib/calendar/settings";
import { createClient } from "@/lib/supabase/server";

export type CalendarTestResult =
  | { ok: true; name: string; timeZone: string; canWrite: boolean }
  | { ok: false; error: string };

export type CalendarSaveResult = { ok: true } | { ok: false; error: string };

/**
 * Reach the calendar with the configured key: its name, its time zone, and
 * whether we may write to it. Read-only against the provider.
 */
export async function testCalendar(provider: string, calendarId: string): Promise<CalendarTestResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("admin"))) return { ok: false, error: t("calendarNeedsAdmin") };
  const adapter = calendarAdapter(provider);
  if (!adapter) return { ok: false, error: t("calendarUnknownProvider", { provider }) };
  const id = calendarId.trim();
  if (!id) return { ok: false, error: t("calendarNeedsId") };
  const r = await adapter.describe(id);
  if (!r.ok) return { ok: false, error: t("calendarUnreachable", { detail: r.error }) };
  return { ok: true, ...r.value };
}

/**
 * Save provider + calendar. A calendar is only saved once the key reaches it
 * AND may write to it — the same guard as the extraction model: a setting
 * that cannot work is refused when it is chosen, not discovered the first time
 * someone applies a visit.
 */
export async function saveCalendarSettings(formData: FormData): Promise<CalendarSaveResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("admin"))) return { ok: false, error: t("calendarNeedsAdmin") };

  const rawProvider = String(formData.get("provider") ?? "").trim();
  const provider = rawProvider === "" ? null : rawProvider;
  if (provider && !CALENDAR_PROVIDERS.some((p) => p.key === provider)) {
    return { ok: false, error: t("calendarUnknownProvider", { provider }) };
  }
  const calendarId = String(formData.get("calendar_id") ?? "").trim() || null;

  if (provider) {
    if (!calendarId) return { ok: false, error: t("calendarNeedsId") };
    const test = await testCalendar(provider, calendarId);
    if (!test.ok) return test;
    if (!test.canWrite) return { ok: false, error: t("calendarReadOnly", { name: test.name }) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      calendar_provider: provider,
      calendar_id: calendarId,
      last_actor_id: await readPersonId(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, error: t("adminSettingsCouldNotSave", { detail: error.message }) };

  revalidatePath("/admin/settings");
  revalidatePath("/visits");
  return { ok: true };
}
