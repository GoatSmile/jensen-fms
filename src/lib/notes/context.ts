/**
 * What was known when a note was spoken — the page, the record on it, the
 * time — so "this bike" can be resolved later (plan-inbox-notes.md, decision
 * 3). Built in the browser from the URL, so it is UNTRUSTED: the server keeps
 * only the shapes below and drops anything else.
 */
export type NoteContext = {
  path: string;
  bikeId?: string;
  organizationId?: string;
  /** The device's clock at the press, ISO. */
  at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The record a page is about, from its URL. */
export function contextFromPath(path: string, at: Date = new Date()): NoteContext {
  const ctx: NoteContext = { path, at: at.toISOString() };
  const bike = path.match(/\/bikes\/([^/?#]+)/)?.[1];
  if (bike && UUID.test(bike)) ctx.bikeId = bike;
  const org = path.match(/^\/organizations\/([^/?#]+)/)?.[1];
  if (org && UUID.test(org)) ctx.organizationId = org;
  return ctx;
}

/** Server side: keep only well-formed fields. */
export function sanitizeNoteContext(raw: unknown): NoteContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const path = typeof r.path === "string" && r.path.startsWith("/") ? r.path.slice(0, 300) : null;
  if (!path) return null;
  const at = typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? r.at : new Date().toISOString();
  const ctx: NoteContext = { path, at };
  if (typeof r.bikeId === "string" && UUID.test(r.bikeId)) ctx.bikeId = r.bikeId;
  if (typeof r.organizationId === "string" && UUID.test(r.organizationId)) ctx.organizationId = r.organizationId;
  return ctx;
}
