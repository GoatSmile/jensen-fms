/**
 * Server-component/action side of the role session — reads the fms_auth
 * cookie via next/headers, so this module must NOT be imported from Edge
 * middleware (middleware reads req.cookies and calls verifySessionToken
 * directly).
 */
import { cookies } from "next/headers";

import { AUTH_COOKIE } from "./gate";
import { verifySessionToken, type AppSession } from "./session";

export type GateState =
  /** No SITE_PASSWORD configured — the gate is off, nothing is scoped. */
  | { kind: "off" }
  /** Signed person session — person/caps/home frozen at login. */
  | { kind: "session"; session: AppSession }
  /** No/invalid cookie — middleware redirects these; defensive only. */
  | { kind: "anonymous" };

export async function readGate(): Promise<GateState> {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return { kind: "off" };

  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return { kind: "anonymous" };

  const session = await verifySessionToken(token, expected);
  return session ? { kind: "session", session } : { kind: "anonymous" };
}

/**
 * The capability set to scope UI by, or null when nothing is scoped (gate
 * off / anonymous-on-the-way-to-login). Null means "show everything".
 */
export async function readAllowedCaps(): Promise<string[] | null> {
  const gate = await readGate();
  return gate.kind === "session" ? gate.session.caps : null;
}

/** Who is working — people.id, or null when the gate is off entirely. */
export async function readPersonId(): Promise<string | null> {
  const gate = await readGate();
  return gate.kind === "session" ? gate.session.person : null;
}
