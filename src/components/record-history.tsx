import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Mic, PhoneIncoming, PhoneOutgoing, Voicemail } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { readCallsScope, scopeAllowsRow } from "@/lib/calls/access";
import { danishDayKey, danishTime, dayHeading } from "@/lib/calls/days";
import { parseExtraction } from "@/lib/inbound/extraction";
import { createServiceClient } from "@/lib/supabase/service";

/** Enough to answer "what happened with this bike lately"; the Inbox has the rest. */
const LIMIT = 20;

/**
 * *Calls and notes* on a bike's or a customer's page (plan-inbox-notes.md,
 * slice 3): every call matched to it and every spoken note attached to it,
 * newest first — "on this date I left the bike in the shed" is the proof the
 * owner wanted on the record. Read with the service client, so each row
 * passes the Inbox's own rule (`scopeAllowsRow`): a technician sees the calls
 * and notes that are theirs, the office all of them; nobody without an inbox
 * sees the section at all.
 */
export async function RecordHistory({
  bikeId,
  organizationId,
}: {
  bikeId?: string;
  organizationId?: string;
}) {
  const scope = await readCallsScope();
  if (!scope || (!bikeId && !organizationId)) return null;
  const [t, locale] = await Promise.all([getTranslations("recordHistory"), getLocale()]);

  const supabase = createServiceClient();
  let q = supabase
    .from("inbound_messages")
    .select(
      "id, kind, channel, received_at, body_text, extraction, from_identity, channel_meta, duration_seconds, handled_by_person_id, addressed_to_person_id",
    )
    .in("kind", ["customer", "note"])
    .order("received_at", { ascending: false })
    .limit(LIMIT);
  q = bikeId ? q.eq("matched_bike_id", bikeId) : q.eq("matched_organization_id", organizationId as string);
  const { data } = await q;
  const rows = (data ?? []).filter((r) => scopeAllowsRow(scope, r));
  if (rows.length === 0) return null;

  const personIds = [...new Set(rows.map((r) => r.handled_by_person_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (personIds.length) {
    const { data: people } = await supabase.from("people").select("id, full_name").in("id", personIds);
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }

  return (
    <Panel title={t("title")} description={t("desc")}>
      <ul className="divide-rule flex flex-col divide-y">
        {rows.map((r) => {
          const isNote = r.kind === "note";
          const direction = (r.channel_meta as { call_direction?: string } | null)?.call_direction;
          const Icon = isNote
            ? Mic
            : r.channel === "voicemail"
              ? Voicemail
              : direction === "outgoing"
                ? PhoneOutgoing
                : PhoneIncoming;
          const x = isNote ? null : parseExtraction(r.extraction);
          const what = isNote ? r.body_text : (x?.callSummary ?? x?.problem ?? r.body_text);
          const person = r.handled_by_person_id ? names.get(r.handled_by_person_id) : null;
          const who = isNote
            ? t("noteBy", { name: person ?? "—" })
            : [r.from_identity, person].filter(Boolean).join(" · ");
          return (
            <li key={r.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2 py-2.5">
              <Icon className="text-ink-2 mt-0.5 size-4" aria-hidden />
              <Link href={`/calls/${r.id}`} className="hover:bg-ground -mx-1 min-w-0 rounded-md px-1">
                <span className="text-ink-2 block text-xs">
                  {dayHeading(danishDayKey(r.received_at), locale)} {danishTime(r.received_at)}
                  {who ? ` · ${who}` : ""}
                </span>
                <span className="line-clamp-2 text-sm">{what ?? t("noText")}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
