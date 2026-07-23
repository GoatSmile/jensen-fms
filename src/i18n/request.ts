import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { AUTH_COOKIE } from "@/lib/auth/gate";
import { verifySessionToken } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import da from "../../messages/da.json";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

/**
 * Locale resolution for the whole app (next-intl WITHOUT URL routing — the
 * locale comes from app_settings, not the path).
 *
 * Two settings drive it (migration 49):
 *   - `worker_language` — the WORKER SURFACES (/work, /scan, the build
 *     workbench + batch build). Covers the employee who can't work in
 *     English while the rest of the app stays in the owner's language.
 *   - `app_language` — everything else.
 *
 * The middleware stamps `x-pathname` on every request so this config can
 * tell which surface it's serving. Customer-facing documents keep their own
 * per-document `language` — this file is app chrome only. `de` is scaffolded
 * but untranslated: every missing key falls back to English via deep-merge,
 * so a partial translation degrades to mixed-language, never to a crash.
 */

export const LOCALES = ["en", "da", "de"] as const;
export type AppLocale = (typeof LOCALES)[number];

function isLocale(v: unknown): v is AppLocale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

type MessageTree = { [key: string]: string | MessageTree };

const MESSAGES: Record<AppLocale, MessageTree> = {
  en: en as MessageTree,
  da: da as MessageTree,
  de: de as MessageTree,
};

/** English keys fill any gap in the target locale (per-key fallback). */
function withEnglishFallback(
  base: MessageTree,
  override: MessageTree,
): MessageTree {
  const out: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      typeof value === "object" && typeof existing === "object"
        ? withEnglishFallback(existing, value)
        : value;
  }
  return out;
}

const WORKER_PATH =
  /^\/(work|scan)(\/|$)|^\/manufacturing-orders\/[^/]+\/(bikes\/[^/]+\/build|build-batch)(\/|$)/;

/**
 * P3: a claimed person's preferred_language supersedes the shared
 * worker_language on worker surfaces — the "per-user at M1" i18n note
 * arrives early via tap-your-name. Only role sessions carry a person.
 */
async function personWorkerLanguage(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return null;
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token || !token.startsWith("v2.")) return null;
  const session = await verifySessionToken(token, expected);
  if (!session?.person) return null;
  const { data } = await supabase
    .from("people")
    .select("preferred_language")
    .eq("id", session.person)
    .maybeSingle();
  const lang = data?.preferred_language?.trim();
  return lang === "da" || lang === "en" ? lang : null;
}

export default getRequestConfig(async () => {
  let locale: AppLocale = "en";
  // A locale lookup must never break a page — any failure means English.
  try {
    const h = await headers();
    const pathname = h.get("x-pathname") ?? "";
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("app_language, worker_language")
      .eq("id", 1)
      .maybeSingle();
    const raw = WORKER_PATH.test(pathname)
      ? ((await personWorkerLanguage(supabase)) ?? data?.worker_language)
      : data?.app_language;
    if (isLocale(raw)) locale = raw;
  } catch {
    /* default en */
  }

  return {
    locale,
    messages:
      locale === "en"
        ? MESSAGES.en
        : withEnglishFallback(MESSAGES.en, MESSAGES[locale]),
  };
});
