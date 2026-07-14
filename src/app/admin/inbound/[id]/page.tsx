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
import {
  INBOUND_STATUS_ORDER,
  INBOUND_STATUS_VARIANT,
} from "@/lib/inbound/types";
import type { MatchCandidates } from "@/lib/inbound/match";

import { MatchPanel } from "./_components/match-panel";

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
  const [t, tCommon, tStatus, tChannel] = await Promise.all([
    getTranslations("adminInbound"),
    getTranslations("common"),
    getTranslations("inboundStatus"),
    getTranslations("inboundChannel"),
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
  const currentStageIndex = INBOUND_STATUS_ORDER.indexOf(msg.status);

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
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/inbound">{t("title")}</Link>
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
      </dl>

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

      {/* Pipeline stages — filled by later slices. */}
      <StagePanel
        title={t("stageTranscript")}
        done={currentStageIndex >= INBOUND_STATUS_ORDER.indexOf("understood")}
        pendingNote={t("stagePendingB")}
        content={msg.body_text}
      />
      <MatchPanel
        messageId={msg.id}
        initialExtractionJson={
          msg.extraction ? JSON.stringify(msg.extraction, null, 2) : ""
        }
        hasExtraction={msg.extraction != null}
        matchCandidates={(msg.match_candidates as MatchCandidates | null) ?? null}
        matchedOrganizationId={msg.matched_organization_id}
        matchedContactId={msg.matched_contact_id}
        matchedBikeId={msg.matched_bike_id}
      />

      {msg.error ? (
        <p className="text-destructive text-sm" role="alert">
          {msg.error}
        </p>
      ) : null}
    </div>
  );
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

function StagePanel({
  title,
  done,
  pendingNote,
  content,
  mono = false,
}: {
  title: string;
  done: boolean;
  pendingNote: string;
  content: string | null;
  mono?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {content ? (
        <pre
          className={
            mono
              ? "bg-muted overflow-x-auto rounded p-3 text-xs"
              : "text-sm whitespace-pre-wrap"
          }
        >
          {content}
        </pre>
      ) : (
        <p className="text-muted-foreground text-sm italic">
          {done ? "—" : pendingNote}
        </p>
      )}
    </section>
  );
}
