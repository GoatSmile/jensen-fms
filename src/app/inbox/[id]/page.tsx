import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createServiceClient } from "@/lib/supabase/service";
import { formatDateTime } from "@/lib/parts/format";
import { INBOUND_STATUS_VARIANT } from "@/lib/inbound/types";
import type { MatchCandidates } from "@/lib/inbound/match";
import {
  inboundSecretStatus,
  loadInboundSettings,
} from "@/lib/inbound/settings";

import { MatchPanel } from "./_components/match-panel";
import { TranscriptPanel } from "./_components/transcript-panel";
import { TicketAction } from "./_components/ticket-action";

/**
 * Inbound message detail — the review surface. Slice A renders the raw
 * message + audio player + empty stage panels (transcript / extraction /
 * match), each showing "pending" until the corresponding slice (B/C/D)
 * fills it. The media lives in a private bucket, so playback uses a
 * short-lived signed URL minted server-side by the service client.
 */
export default async function InboundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCommon, tStatus, tChannel, tOutcome] = await Promise.all([
    getTranslations("inbox"),
    getTranslations("common"),
    getTranslations("inboundStatus"),
    getTranslations("inboundChannel"),
    getTranslations("inboundOutcome"),
  ]);

  const supabase = createServiceClient();
  const { data: msg, error } = await supabase
    .from("inbound_messages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load inbound message: ${error.message}`);
  }
  if (!msg) notFound();

  // Signed URL for playback (private bucket) — 1 h is ample for a review pass.
  let mediaUrl: string | null = null;
  if (msg.media_path) {
    const { data: signed } = await supabase.storage
      .from("inbound")
      .createSignedUrl(msg.media_path, 3600);
    mediaUrl = signed?.signedUrl ?? null;
  }

  const meta = (msg.channel_meta ?? {}) as { original_filename?: string };

  // A captured call with no message + no transcript is a contact event, not a
  // voicemail — show its metadata, skip the pipeline panels.
  const hasContent = Boolean(msg.media_path || msg.body_text);
  const isCallEvent =
    msg.call_outcome != null && msg.call_outcome !== "message_left" && !hasContent;
  const outcomeKey = msg.call_outcome ? OUTCOME_KEY[msg.call_outcome] : null;
  const outcomeLabel = msg.call_outcome
    ? outcomeKey && tOutcome.has(outcomeKey)
      ? tOutcome(outcomeKey)
      : msg.call_outcome
    : null;

  // Trust signals: transcript clarity (acoustic, 0..1) and the model's own
  // parse confidence (ordinal). Kept separate — never blended.
  const clarity = msg.transcript_confidence;
  const parseConfidence =
    (msg.extraction as { confidence?: string } | null)?.confidence ?? null;

  // Shadow-mode flag + the linked ticket's number (if one was created).
  const settings = await loadInboundSettings(supabase);
  const { shadowMode } = settings;
  const secrets = inboundSecretStatus(settings);
  const extractionReady = secrets.extraction.every((s) => s.present);
  const transcriptionReady = secrets.transcription.every((s) => s.present);
  let ticketNumber: string | null = null;
  if (msg.ticket_id) {
    const { data: ticket } = await supabase
      .from("maintenance_tickets")
      .select("ticket_number")
      .eq("id", msg.ticket_id)
      .maybeSingle();
    ticketNumber = ticket?.ticket_number ?? null;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/inbox">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("detailCrumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {meta.original_filename || t("detailCrumb")}
        </h1>
        <Badge variant="outline" className="font-normal">
          {tChannel(msg.channel)}
        </Badge>
        <Badge variant={INBOUND_STATUS_VARIANT[msg.status]}>
          {tStatus(msg.status)}
        </Badge>
      </header>

      {/* Facts */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border p-4 text-sm sm:grid-cols-3">
        <Fact label={t("fromLabel")}>
          <span className="font-mono">
            {msg.from_identity ?? (
              <span className="text-muted-foreground">
                {t("unknownSender")}
              </span>
            )}
          </span>
        </Fact>
        <Fact label={t("receivedLabel")}>
          {formatDateTime(msg.received_at)}
        </Fact>
        <Fact label={t("languageLabel")}>
          {msg.language ?? <span className="text-muted-foreground">—</span>}
        </Fact>
        {msg.duration_seconds != null ? (
          <Fact label={t("durationLabel")}>
            {formatDuration(msg.duration_seconds)}
          </Fact>
        ) : null}
        {outcomeLabel ? (
          <Fact label={t("outcomeLabel")}>{outcomeLabel}</Fact>
        ) : null}
        {clarity != null ? (
          <Fact label={t("clarityLabel")}>
            <span className={clarity < 0.6 ? "text-amber-700 dark:text-amber-500" : undefined}>
              {Math.round(clarity * 100)}% · {t(clarityKey(clarity))}
            </span>
          </Fact>
        ) : null}
        {parseConfidence && t.has(CONF_KEY[parseConfidence] ?? "") ? (
          <Fact label={t("parseLabel")}>
            <span className={parseConfidence === "low" ? "text-amber-700 dark:text-amber-500" : undefined}>
              {t(CONF_KEY[parseConfidence])}
            </span>
          </Fact>
        ) : null}
      </dl>

      {isCallEvent ? (
        <section className="rounded-md border p-4">
          <p className="text-muted-foreground text-sm">{t("callEventNote")}</p>
        </section>
      ) : (
        <>
          {/* Audio */}
          <section className="flex flex-col gap-2 rounded-md border p-4">
            <h2 className="text-sm font-semibold">{t("audioTitle")}</h2>
            {mediaUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls preload="metadata" className="w-full">
                <source src={mediaUrl} type={msg.media_mime_type ?? undefined} />
              </audio>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                {t("noAudio")}
              </p>
            )}
          </section>

          {/* Pipeline stages. Transcript is editable (Slice-C harness ingress);
              extraction + match live in MatchPanel. */}
          <TranscriptPanel
            messageId={msg.id}
            initialBody={msg.body_text}
            hasAudio={Boolean(msg.media_path)}
            transcriptionReady={transcriptionReady}
            extractionReady={extractionReady}
          />
          <MatchPanel
            messageId={msg.id}
            initialExtractionJson={
              msg.extraction ? JSON.stringify(msg.extraction, null, 2) : ""
            }
            hasExtraction={msg.extraction != null}
            matchCandidates={
              (msg.match_candidates as MatchCandidates | null) ?? null
            }
            matchedOrganizationId={msg.matched_organization_id}
            matchedContactId={msg.matched_contact_id}
            matchedBikeId={msg.matched_bike_id}
          />

          <TicketAction
            messageId={msg.id}
            ticketId={msg.ticket_id}
            ticketNumber={ticketNumber}
            canCreate={msg.status === "matched"}
            shadowMode={shadowMode}
          />
        </>
      )}

      {msg.error ? (
        <p className="text-destructive text-sm" role="alert">
          {msg.error}
        </p>
      ) : null}
    </div>
  );
}

/** Maps a stored call_outcome to its `inboundOutcome` message key. */
const OUTCOME_KEY: Record<string, string> = {
  message_left: "messageLeft",
  no_message: "noMessage",
  busy: "busy",
  "no-answer": "noAnswer",
  failed: "failed",
  canceled: "canceled",
};

/** Transcript clarity bucket → `inbox` message key. */
function clarityKey(confidence: number): string {
  if (confidence >= 0.85) return "clarityClear";
  if (confidence >= 0.6) return "clarityFair";
  return "clarityGarbled";
}

/** Extraction parse-confidence ordinal → `inbox` message key. */
const CONF_KEY: Record<string, string> = {
  low: "confLow",
  medium: "confMedium",
  high: "confHigh",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
