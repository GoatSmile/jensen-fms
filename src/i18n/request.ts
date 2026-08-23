import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { AUTH_COOKIE, LAST_PERSON_COOKIE } from "@/lib/auth/gate";
import { verifySessionToken } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import da from "../../messages/da.json";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

/**
 * Locale resolution for the whole app (next-intl WITHOUT URL routing — the
 * locale comes from the logged-in person, else app_settings; never the path).
 *
 * The logged-in person's `preferred_language` wins everywhere when set. Two
 * settings are the fallback (migration 49):
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
 * The logged-in person's own language, which supersedes BOTH app_settings
 * languages on every surface (migration 81 — preferences belong to the
 * person and travel with the login). NULL there means "follow the app
 * default", which is why the column is nullable: before that, "never
 * decided" and "chose Danish" were the same row.
 *
 * ON THE LOGIN SCREEN there is no session yet, so it falls back to whoever
 * logged in on this device last (`fms_last_person`, the same cookie that
 * preselects their name). Otherwise a Danish-speaking worker would meet an
 * English screen and only get their own language AFTER signing in — the one
 * screen where nobody has told us who they are is the screen where the
 * device's own memory is all we have.
 *
 * Deliberately login-only: the other unauthenticated surfaces (`/b/<id>`,
 * `/report`) are CUSTOMER-facing, and a customer's language is not whoever
 * used the shop tablet last.
 */
async function personLanguage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  isLoginPath: boolean,
): Promise<string | null> {
  const jar = await cookies();
  const expected = process.env.SITE_PASSWORD;

  let personId: string | null = null;
  if (expected) {
    const token = jar.get(AUTH_COOKIE)?.value;
    if (token?.startsWith("v2.")) {
      const session = await verifySessionToken(token, expected);
      personId = session?.person ?? null;
    }
  }
  if (!personId && isLoginPath) {
    personId = jar.get(LAST_PERSON_COOKIE)?.value ?? null;
  }
  if (!personId) return null;

  const { data } = await supabase
    .from("people")
    .select("preferred_language")
    .eq("id", personId)
    // An archived person stops speaking for the device.
    .eq("is_active", true)
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
    // The person wins; the app_settings pair is the fallback for whoever
    // hasn't chosen (and for the shared Admin account).
    const fallback = WORKER_PATH.test(pathname)
      ? data?.worker_language
      : data?.app_language;
    const isLoginPath = pathname === "/login" || pathname.startsWith("/login/");
    const raw = (await personLanguage(supabase, isLoginPath)) ?? fallback;
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
