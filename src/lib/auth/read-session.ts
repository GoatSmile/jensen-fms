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

/**
 * May this viewer see money — costs, prices, margins, stock value? The `costs`
 * capability (2026-09-26). Pages that a technician can open ask this, and then
 * neither render nor SEND the figures: a hidden column that still ships its
 * numbers to the browser is not hidden. Gate off → everything shows.
 */
export async function readCanSeeCosts(): Promise<boolean> {
  return readHasCapability("costs");
}

/**
 * Does this viewer hold `cap`? Gate off → yes. The one check for an ACTION
 * that its route alone does not gate — a picker that creates a part, a
 * template writer — because middleware only ever sees the page's URL, and a
 * server action is callable from any page that imports it.
 */
export async function readHasCapability(cap: string): Promise<boolean> {
  const caps = await readAllowedCaps();
  return caps === null || caps.includes(cap);
}

/** Who is working — people.id, or null when the gate is off entirely. */
export async function readPersonId(): Promise<string | null> {
  const gate = await readGate();
  return gate.kind === "session" ? gate.session.person : null;
}
