import "server-only";

import {
  inboundSecretStatus,
  loadInboundSettings,
  type InboundSettings,
} from "@/lib/inbound/settings";
import { createClient } from "@/lib/supabase/server";

/**
 * Is dictation actually wired up? SERVER-ONLY (reads process.env through
 * inboundSecretStatus).
 *
 * Dictation shares the inbound pipeline's transcription provider selection —
 * it is the same capability, so there is exactly one place to configure it
 * (`/admin/settings` → provider; the key in env, config doctrine tier 1). The
 * answer is threaded to the button as a prop so a missing key disables it with
 * a reason, rather than failing on tap after the tech has already spoken.
 */
export async function dictationReady(): Promise<boolean> {
  const supabase = await createClient();
  const settings = await loadInboundSettings(supabase);
  return transcriptionSecretsPresent(settings);
}

/** The same check when the caller already holds the settings. */
export function transcriptionSecretsPresent(settings: InboundSettings): boolean {
  const secrets = inboundSecretStatus(settings).transcription;
  return secrets.length > 0 && secrets.every((s) => s.present);
}
