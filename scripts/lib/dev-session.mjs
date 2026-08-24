/**
 * Mint a signed `fms_auth` session cookie for local testing.
 *
 * WHY THIS EXISTS: with the login gate on, nothing scripted can reach a page —
 * `npm run smoke` reported 4 pass · 106 redirect the first time it met a gated
 * environment. And attribution work (migration 83) can only be tested AS
 * someone, since the whole point is which person the write is stamped with.
 *
 * WHY NOT A BYPASS: an env var that skips auth would put a bypass branch in
 * shipped middleware, one bad refactor away from being live. This mints a real
 * session instead — same HMAC as `src/lib/auth/session.ts`, so it only works
 * where SITE_PASSWORD is already known, which means local.
 *
 * It will mint for ANY person, including one the login screen would refuse
 * (no password, no roles — "Lars who never logs in" is exactly the case worth
 * testing). Deliberate: this is a test tool, not a login.
 */
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const HMAC_PEPPER = "jensen-fms:session:v2";

export async function loadEnv(root = process.cwd()) {
  const raw = await readFile(path.join(root, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const b64url = (input) => Buffer.from(input).toString("base64url");

/** `v2.<payload>.<sig>` — the exact shape verifySessionToken() accepts. */
export function signSession(session, secret) {
  const payload = b64url(JSON.stringify(session));
  const sig = crypto
    .createHmac("sha256", Buffer.from(`${secret}:${HMAC_PEPPER}`))
    .update(payload)
    .digest("base64url");
  return `v2.${payload}.${sig}`;
}

async function rest(env, pathAndQuery) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Resolve a person by id, exact name, or case-insensitive fragment. Falls back
 * to the seeded Admin row so `dev-session.mjs` with no argument still works.
 */
export async function resolvePerson(env, who) {
  if (!who) {
    const [admin] = await rest(env, "people?select=id,full_name&is_system=is.true&limit=1");
    if (!admin) throw new Error("No system Admin person found");
    return admin;
  }
  if (/^[0-9a-f-]{36}$/i.test(who)) {
    const [byId] = await rest(env, `people?select=id,full_name&id=eq.${who}`);
    if (!byId) throw new Error(`No person with id ${who}`);
    return byId;
  }
  const matches = await rest(
    env,
    `people?select=id,full_name&full_name=ilike.*${encodeURIComponent(who)}*&limit=5`,
  );
  if (matches.length === 0) throw new Error(`No person matching "${who}"`);
  if (matches.length > 1) {
    throw new Error(
      `"${who}" matches ${matches.length}: ${matches.map((m) => m.full_name).join(", ")}`,
    );
  }
  return matches[0];
}

/**
 * Capabilities for a person: the union of their active roles, exactly as
 * `loadPersonAccess` computes it at login. A person with no roles gets the
 * full set — the login screen would refuse them, but a test session for
 * someone who never logs in should still be able to reach a page.
 */
export async function capsFor(env, personId) {
  const rows = await rest(
    env,
    `person_roles?select=role_id,role:roles(key,home_path,sort_order,is_active)&person_id=eq.${personId}`,
  );
  const roles = rows
    .map((r) => r.role)
    .filter((r) => r && r.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (roles.length === 0) return { role: "admin", home: "/", caps: ALL_CAPS };

  const roleIds = rows.map((r) => r.role_id).filter(Boolean);
  const capRows = roleIds.length
    ? await rest(env, `role_capabilities?select=capability&role_id=in.(${roleIds.join(",")})`)
    : [];
  const caps = [...new Set(capRows.map((c) => c.capability))];
  return {
    role: roles[0].key,
    home: roles[0].home_path?.startsWith("/") ? roles[0].home_path : "/",
    // A role that grants nothing would make every page bounce; treat that as
    // a misconfiguration rather than a test worth running.
    caps: caps.length ? caps : ALL_CAPS,
  };
}

/** Mirrors src/lib/people/capabilities.ts. */
export const ALL_CAPS = [
  "dashboard", "bikes", "templates", "parts", "maintenance", "inbox", "work",
  "scan", "mo", "po", "so", "paint", "invoices", "agreements", "customers", "admin",
];

/** The whole job: person → cookie value. */
export async function mintCookie(env, who, { allCaps = false } = {}) {
  const secret = env.SITE_PASSWORD;
  if (!secret) return null; // gate is off — no cookie needed
  const person = await resolvePerson(env, who);
  const access = await capsFor(env, person.id);
  const token = signSession(
    {
      v: 1,
      role: access.role,
      caps: allCaps ? ALL_CAPS : access.caps,
      home: access.home,
      person: person.id,
    },
    secret,
  );
  return { person, token, cookie: `fms_auth=${token}` };
}
