import "server-only";

import type {
  AdapterResult,
  CallEndpoint,
  CallImportAdapter,
  RecordedItem,
} from "./types";

/**
 * Relatel (a TDC company) — Jensen's own switchboard and mobiles. REST API v2,
 * bearer auth with a PERSONAL access token (RELATEL_TOKEN). Only a number's
 * own user may hear its recordings, so the token is the technician's own,
 * created logged in as him (docs/OPERATIONS.md). Spec: dev.relatel.dk/oas.
 *
 * Found against the live API on 2026-09-29, not in the spec:
 * - `GET /calls?endpoint=` does NOT filter (an unknown id returns everything),
 *   so selection happens here, on the call's endpoint AND on every node of its
 *   path — a main-number call forwarded to a mobile carries the reception as
 *   its endpoint and the employee only in `nodes`.
 * - `limit` caps at 100 and calls come newest first; older pages are reached
 *   with `started_at_lt_or_eq`. Voicemails have no lower-bound filter, so they
 *   page back with `created_at_lt_or_eq` until they pass `since`.
 * - Numbers are country code + number without "+" (4529247943).
 * - Mobile recordings are MP3, mono, 16 kHz — speakers are separated by
 *   diarization, not by channel.
 */
const BASE = "https://app.relatel.dk/api/v2";
const PAGE = 100;
/** A runaway guard, not a business limit: ~2 000 calls per run. */
const MAX_PAGES = 20;

type RelatelNode = { endpoint?: string | null; endpoint_name?: string | null };
type RelatelCall = {
  call_uuid: string;
  endpoint?: string | null;
  endpoint_name?: string | null;
  direction?: string | null;
  remote_number?: string | null;
  started_at: string;
  talk_duration?: number | null;
  nodes?: RelatelNode[] | null;
  recording?: {
    id: number;
    duration?: number | null;
    expired?: boolean;
    sound?: { url?: string | null } | null;
  } | null;
};
type RelatelVoicemail = {
  id: number;
  created_at: string;
  duration?: number | null;
  from_number?: string | null;
  endpoint?: string | null;
  endpoint_name?: string | null;
};

function token(): string | null {
  return process.env.RELATEL_TOKEN?.trim() || null;
}

async function api<T>(path: string): Promise<AdapterResult<T>> {
  const bearer = token();
  if (!bearer) return { ok: false, error: "RELATEL_TOKEN is not set" };
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `Relatel unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: `Relatel refused the token (${res.status}) — is it still active?` };
  }
  if (!res.ok) {
    return { ok: false, error: `Relatel ${res.status} on ${path.split("?")[0]}` };
  }
  return { ok: true, value: (await res.json()) as T };
}

/** "4529247943" → "+4529247943"; anything without digits → null. */
export function relatelToE164(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 6 ? `+${digits}` : null;
}

/** The selected endpoint a call belongs to, if any — endpoint first, then path. */
function selectedEndpoint(
  call: RelatelCall,
  wanted: Set<string>,
): RelatelNode | null {
  if (call.endpoint && wanted.has(call.endpoint)) return call;
  return (call.nodes ?? []).find((n) => n.endpoint && wanted.has(n.endpoint)) ?? null;
}

async function listCalls(since: Date): Promise<AdapterResult<RelatelCall[]>> {
  const seen = new Map<string, RelatelCall>();
  let upper: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      started_at_gt_or_eq: since.toISOString(),
      limit: String(PAGE),
    });
    if (upper) q.set("started_at_lt_or_eq", upper);
    const r = await api<{ calls?: RelatelCall[] }>(`/calls?${q}`);
    if (!r.ok) return r;
    const calls = r.value.calls ?? [];
    const before = seen.size;
    for (const c of calls) seen.set(c.call_uuid, c);
    // The boundary call reappears on the next page (lt_or_eq), so progress is
    // measured in NEW calls, not page length.
    if (calls.length < PAGE || seen.size === before) break;
    upper = calls[calls.length - 1].started_at;
  }
  return { ok: true, value: [...seen.values()] };
}

async function listVoicemails(since: Date): Promise<AdapterResult<RelatelVoicemail[]>> {
  const seen = new Map<number, RelatelVoicemail>();
  let upper: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (upper) q.set("created_at_lt_or_eq", upper);
    const r = await api<{ voice_mails?: RelatelVoicemail[] }>(`/voice_mails?${q}`);
    if (!r.ok) return r;
    const vms = r.value.voice_mails ?? [];
    const before = seen.size;
    for (const v of vms) seen.set(v.id, v);
    const oldest = vms[vms.length - 1]?.created_at;
    if (
      vms.length < PAGE ||
      seen.size === before ||
      !oldest ||
      new Date(oldest) < since
    ) {
      break;
    }
    upper = oldest;
  }
  return {
    ok: true,
    value: [...seen.values()].filter((v) => new Date(v.created_at) >= since),
  };
}

export const relatelAdapter: CallImportAdapter = {
  async listEndpoints() {
    const r = await api<{
      employees?: { endpoint?: string; name?: string; number_formatted?: string }[];
    }>("/employees");
    if (!r.ok) return r;
    const endpoints: CallEndpoint[] = (r.value.employees ?? [])
      .filter((e) => e.endpoint)
      .map((e) => ({
        id: e.endpoint as string,
        name: e.name?.trim() || e.number_formatted || (e.endpoint as string),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
    return { ok: true, value: endpoints };
  },

  async listRecorded({ since, endpoints, voicemails }) {
    const wanted = new Set(endpoints);
    if (wanted.size === 0) return { ok: true, value: [] };
    const items: RecordedItem[] = [];

    const calls = await listCalls(since);
    if (!calls.ok) return calls;
    for (const c of calls.value) {
      const rec = c.recording;
      if (!rec || rec.expired || !rec.sound?.url) continue;
      const who = selectedEndpoint(c, wanted);
      if (!who?.endpoint) continue;
      items.push({
        externalId: `relatel:call:${c.call_uuid}`,
        kind: "call",
        direction: c.direction === "outgoing" ? "outgoing" : "incoming",
        remoteNumber: relatelToE164(c.remote_number),
        endpoint: who.endpoint,
        endpointName: who.endpoint_name ?? null,
        startedAt: c.started_at,
        durationSeconds: rec.duration ?? c.talk_duration ?? null,
        audioRef: rec.sound.url,
      });
    }

    if (voicemails) {
      const vms = await listVoicemails(since);
      if (!vms.ok) return vms;
      for (const v of vms.value) {
        if (!v.endpoint || !wanted.has(v.endpoint)) continue;
        items.push({
          externalId: `relatel:voicemail:${v.id}`,
          kind: "voicemail",
          direction: "incoming",
          remoteNumber: relatelToE164(v.from_number),
          endpoint: v.endpoint,
          endpointName: v.endpoint_name ?? null,
          startedAt: v.created_at,
          durationSeconds: v.duration ?? null,
          audioRef: `${BASE}/voice_mails/${v.id}/sound`,
        });
      }
    }
    // Oldest first, so the inbox fills in the order the calls happened.
    items.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return { ok: true, value: items };
  },

  async fetchAudio(item) {
    const bearer = token();
    if (!bearer) return { ok: false, error: "RELATEL_TOKEN is not set" };
    // Only ever our own API host: the ref came from Relatel's response, and a
    // bearer token must not follow a URL anywhere else.
    if (!item.audioRef.startsWith(`${BASE}/`)) {
      return { ok: false, error: "recording URL is not on the Relatel API" };
    }
    try {
      const res = await fetch(item.audioRef, {
        headers: { Authorization: `Bearer ${bearer}` },
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, error: `Relatel ${res.status} on the recording` };
      return {
        ok: true,
        value: {
          bytes: await res.arrayBuffer(),
          mime: res.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
        },
      };
    } catch (e) {
      return { ok: false, error: `recording download failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
