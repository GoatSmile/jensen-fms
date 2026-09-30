/**
 * Call import — the shop's OWN phone system as an inbound source (migration
 * 111). A scheduled job asks the selected adapter for recorded calls and
 * voicemails and imports each one into `inbound_messages`; from there the
 * channel-blind pipeline runs exactly as it does for a Twilio recording.
 *
 * An adapter only answers three questions — who can be imported, what was
 * recorded (or rang unrecorded) since X, and give me that audio. Storage, rows and the pipeline
 * are ./import.ts, shared by every adapter.
 */

/** Someone whose calls can be imported (Relatel: an employee). */
export type CallEndpoint = {
  id: string;
  name: string;
  /** The line's own number, E.164 — how a call between two of our lines is known. */
  number: string | null;
};

export type RecordedItem = {
  /** Provider-scoped, stable: the idempotency key (channel_meta.external_id). */
  externalId: string;
  kind: "call" | "voicemail";
  direction: "incoming" | "outgoing";
  /** The OTHER party, E.164 ("+4529247943"); null when withheld. */
  remoteNumber: string | null;
  /** The selected endpoint this item belongs to. */
  endpoint: string;
  endpointName: string | null;
  startedAt: string;
  durationSeconds: number | null;
  /**
   * `recorded` carries audio; the other two are call EVENTS with nothing to
   * hear — an incoming call answered on a line that does not record (a
   * main-number call: Relatel records those only on its Contact Center
   * plans), or one that rang the line and was not answered. Imported so a
   * call never vanishes just because nobody recorded it.
   */
  outcome: "recorded" | "answered_unrecorded" | "missed";
  /** Adapter-owned handle for fetchAudio; never shown or stored. Null for an event. */
  audioRef: string | null;
};

export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Every call takes the TOKEN it should use: the provider lets only a number's
 * own user hear its recordings, so one run may use several (one per line).
 * Adapters never read env themselves — src/lib/calls/lines.ts does, behind the
 * allowed-name check.
 */
export type CallImportAdapter = {
  listEndpoints(token: string): Promise<AdapterResult<CallEndpoint[]>>;
  listRecorded(
    token: string,
    opts: { since: Date; endpoints: string[]; voicemails: boolean },
  ): Promise<AdapterResult<RecordedItem[]>>;
  fetchAudio(
    token: string,
    item: RecordedItem,
  ): Promise<AdapterResult<{ bytes: ArrayBuffer; mime: string }>>;
};
