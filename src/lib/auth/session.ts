/**
 * Person sessions (auth v0.5) — an HMAC-signed cookie payload carrying WHO
 * logged in, what they can open, and where they land. Same honesty note as
 * ever: a UX/scoping wall, not a security boundary; the perimeter stays
 * Vercel SSO until M1.
 *
 * Design (docs/plan-people-roles.md): the session is SELF-CONTAINED —
 * person, role key, capability list and home path are frozen into the
 * cookie at login, because Edge middleware can't (and shouldn't) hit
 * Postgres per request. Consequence: capability/home/role edits in admin
 * apply at the next login, not live.
 *
 * Every session has a person (migration 80) — the shared password logs in
 * as the seeded `Admin` person, so there is no such thing as an
 * unattributed session any more.
 *
 * The HMAC key derives from SITE_PASSWORD (+ a fixed pepper) — no new env
 * var; rotating SITE_PASSWORD invalidates all sessions, which is the
 * correct behaviour for a shared-secret world. Web Crypto only, so the
 * same helpers run in Edge middleware and Node server actions. This whole
 * layer dies at M1 (Supabase sessions carry person + roles as claims).
 *
 * Token format: `v2.<base64url payload JSON>.<base64url HMAC-SHA256>`.
 */

export type AppSession = {
  /**
   * 2 since 2026-09-26, when `costs` joined the registry; 3 since 2026-09-27,
   * when `templates_edit` did. An older session was minted before its
   * capability existed: see the upgrades in `verifySessionToken`.
   */
  v: 1 | 2 | 3;
  /** Primary role key ('owner', 'workshop', 'admin') — display + home. */
  role: string;
  /** Capability keys frozen at login (validated against the registry). */
  caps: string[];
  /** Where this person lands / gets bounced to (their role's home_path). */
  home: string;
  /** people.id — who is working. Required: no anonymous sessions. */
  person: string;
};

const TOKEN_PREFIX = "v2";
const HMAC_PEPPER = "jensen-fms:session:v2";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${secret}:${HMAC_PEPPER}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(
  session: AppSession,
  secret: string,
): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(session)),
  );
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `${TOKEN_PREFIX}.${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<AppSession | null> {
  const [prefix, payload, sig] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !payload || !sig) return null;

  const sigBytes = fromBase64Url(sig);
  if (!sigBytes) return null;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  const payloadBytes = fromBase64Url(payload);
  if (!payloadBytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const s = parsed as Partial<AppSession>;
  if (
    (s.v !== 1 && s.v !== 2 && s.v !== 3) ||
    typeof s.role !== "string" ||
    !Array.isArray(s.caps) ||
    !s.caps.every((c) => typeof c === "string") ||
    typeof s.home !== "string" ||
    !s.home.startsWith("/") ||
    // Pre-migration-80 cookies carried no person; they fail here and the
    // holder logs in again under a name.
    typeof s.person !== "string" ||
    s.person.length === 0
  ) {
    return null;
  }
  // A v1 session predates `costs` (2026-09-26), so it cannot say whether its
  // holder may see money. Everyone who could open invoices could already see
  // money everywhere, and the one role without invoices — Workshop — is the one
  // `costs` exists to exclude; so a v1 session holding `invoices` gets `costs`.
  // Without this, deploying the gate would hide Dennis's costs until his next
  // login (sessions last 30 days). Every v1 cookie has expired by 2026-10-27;
  // delete this block then.
  let session = s as AppSession;
  if (
    session.v === 1 &&
    session.caps.includes("invoices") &&
    !session.caps.includes("costs")
  ) {
    session = { ...session, caps: [...session.caps, "costs"] };
  }
  // Same shape for `templates_edit` (2026-09-27): the two roles granted it,
  // Owner and IT admin, are exactly the ones holding `admin`, so a pre-v3
  // session holding `admin` gets it. Every v2 cookie has expired by
  // 2026-10-27 too; delete both blocks then.
  if (
    session.v < 3 &&
    session.caps.includes("admin") &&
    !session.caps.includes("templates_edit")
  ) {
    session = { ...session, caps: [...session.caps, "templates_edit"] };
  }
  return session;
}
