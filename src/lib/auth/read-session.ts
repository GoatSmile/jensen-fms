/**
 * Server-component/action side of the role session — reads the fms_auth
 * cookie via next/headers, so this module must NOT be imported from Edge
 * middleware (middleware reads req.cookies and calls verifySessionToken
 * directly).
 */
import { cookies } from "next/headers";

import { AUTH_COOKIE, passwordToken } from "./gate";
import { verifySessionToken, type RoleSession } from "./session";

export type GateState =
  /** No SITE_PASSWORD configured — the gate is off, nothing is scoped. */
  | { kind: "off" }
  /** Legacy shared-password token — full access (owner-equivalent) during cutover. */
  | { kind: "legacy" }
  /** Role-password session — caps/home frozen at login. */
  | { kind: "role"; session: RoleSession }
  /** No/invalid cookie — middleware redirects these; defensive only. */
  | { kind: "anonymous" };

export async function readGate(): Promise<GateState> {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return { kind: "off" };

  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return { kind: "anonymous" };
  if (token === (await passwordToken(expected))) return { kind: "legacy" };

  const session = await verifySessionToken(token, expected);
  return session ? { kind: "role", session } : { kind: "anonymous" };
}

/**
 * The capability set to scope UI by, or null when nothing is scoped (gate
 * off / legacy full-access / anonymous-on-the-way-to-login). Null means
 * "show everything" — the pre-P2 behaviour.
 */
export async function readAllowedCaps(): Promise<string[] | null> {
  const gate = await readGate();
  return gate.kind === "role" ? gate.session.caps : null;
}
