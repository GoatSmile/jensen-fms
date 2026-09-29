/**
 * Call import — the shop's OWN phone system as an inbound source (migration
 * 111). A scheduled job asks the selected adapter for recorded calls and
 * voicemails and imports each one into `inbound_messages`; from there the
 * channel-blind pipeline runs exactly as it does for a Twilio recording.
 *
 * An adapter only answers three questions — who can be imported, what was
 * recorded since X, and give me that audio. Storage, rows and the pipeline
 * are ./import.ts, shared by every adapter.
 */

/** Someone whose calls can be imported (Relatel: an employee). */
export type CallEndpoint = { id: string; name: string };

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
  /** Adapter-owned handle for fetchAudio; never shown or stored. */
  audioRef: string;
};

export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type CallImportAdapter = {
  listEndpoints(): Promise<AdapterResult<CallEndpoint[]>>;
  listRecorded(opts: {
    since: Date;
    endpoints: string[];
    voicemails: boolean;
  }): Promise<AdapterResult<RecordedItem[]>>;
  fetchAudio(
    item: RecordedItem,
  ): Promise<AdapterResult<{ bytes: ArrayBuffer; mime: string }>>;
};
