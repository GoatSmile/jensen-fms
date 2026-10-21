import "server-only";

import crypto from "node:crypto";

/**
 * An access token for the shop's Google SERVICE ACCOUNT
 * (`GOOGLE_SERVICE_ACCOUNT_KEY`, env only), for one set of scopes. No SDK: the
 * key signs a JWT (Node's crypto) traded for an hour's token, cached per scope.
 * The calendar and the secretary's Google voice both come through here.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type ServiceAccountKey = { client_email: string; private_key: string };

const cache = new Map<string, { token: string; expiresAt: number }>();

function readKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const k = JSON.parse(raw) as Partial<ServiceAccountKey>;
    return k.client_email && k.private_key ? { client_email: k.client_email, private_key: k.private_key } : null;
  } catch {
    return null;
  }
}

export async function googleAccessToken(scope: string): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const hit = cache.get(scope);
  if (hit && hit.expiresAt > Date.now() + 60_000) return { ok: true, value: hit.token };
  const key = readKey();
  if (!key) return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_KEY is missing or not a service-account key" };

  const b64 = (v: string) => Buffer.from(v).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.` +
    b64(JSON.stringify({ iss: key.client_email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  let signature: string;
  try {
    signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), key.private_key).toString("base64url");
  } catch (e) {
    return { ok: false, error: `the key could not sign: ${(e as Error).message}` };
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!res.ok || !json.access_token) {
      return { ok: false, error: `Google refused the key: ${json.error_description ?? json.error ?? res.status}` };
    }
    cache.set(scope, { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 });
    return { ok: true, value: json.access_token };
  } catch (e) {
    return { ok: false, error: `Google could not be reached: ${(e as Error).message}` };
  }
}
