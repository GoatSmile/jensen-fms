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
export async function saveLocationSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const primaryRaw = nullable(formData.get("primary_location_id"));
  const primary_location_id =
    primaryRaw && primaryRaw.trim() !== "" ? primaryRaw.trim() : null;
  const hide_location_info = formData.get("hide_location_info") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      primary_location_id,
      hide_location_info,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return { ok: false, error: `Could not save settings: ${error.message}` };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/admin/locations");
  revalidatePath("/parts/[id]", "page");
  revalidatePath("/purchase-orders/[id]", "page");
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
