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
