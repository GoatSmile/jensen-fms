/**
 * Thin fetch wrapper for the e-conomic REST API (restapi.e-conomic.com).
 * No SDK — same philosophy as src/lib/email/send.ts. Server-only.
 *
 * Auth is two headers (config-vs-secrets rule: tokens are secrets → env):
 *   X-AppSecretToken      — ECONOMIC_APP_SECRET_TOKEN
 *   X-AgreementGrantToken — ECONOMIC_AGREEMENT_GRANT_TOKEN
 * The owner generates both from their e-conomic agreement; the public
 * demo/demo pair is READ-ONLY (writes fail E02002), so it never risks
 * booking anything real — but we still never default to it silently.
 */

const BASE_URL = "https://restapi.e-conomic.com";

export type EconomicResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function economicEnvReady(): boolean {
  return Boolean(
    process.env.ECONOMIC_APP_SECRET_TOKEN &&
      process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN,
  );
}

export async function economicFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<EconomicResult<T>> {
  const app = process.env.ECONOMIC_APP_SECRET_TOKEN;
  const grant = process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN;
  if (!app || !grant) {
    return {
      ok: false,
      error:
        "e-conomic tokens are not set — add ECONOMIC_APP_SECRET_TOKEN and ECONOMIC_AGREEMENT_GRANT_TOKEN to .env.local (and Vercel), then restart the dev server.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "X-AppSecretToken": app,
        "X-AgreementGrantToken": grant,
        "Content-Type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach e-conomic: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body — handled below via status.
  }

  if (!res.ok) {
    const err = (json ?? {}) as {
      errorCode?: string;
      message?: string;
      developerHint?: string;
      errors?: unknown;
    };
    const parts = [
      err.errorCode ? `[${err.errorCode}]` : `HTTP ${res.status}`,
      err.message ?? "e-conomic rejected the request.",
      err.developerHint,
      err.errors ? JSON.stringify(err.errors).slice(0, 300) : null,
    ].filter(Boolean);
    return { ok: false, error: parts.join(" ") };
  }

  return { ok: true, data: json as T };
}
