import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/parts/format";
import {
  INBOUND_STATUS_VARIANT,
  commandStatusKey,
  type InboundMessageRow,
} from "@/lib/inbound/types";
import { isSpamFolded } from "@/lib/inbound/triage";

import { NewCommand } from "./_components/new-command";
import { UploadVoicemail } from "./_components/upload-voicemail";

/**
 * Generic inbound trunk — review harness (Slice A). Lists every inbound
 * message (voicemail-only today) newest-first with its pipeline status; the
 * "Upload a voicemail" ingress feeds the pipeline being built in B–F. When a
 * second channel lands it shows here too, tagged by its channel badge.
 */
export default async function InboundPage() {
  const [t, tCommon, tStatus, tChannel, tCmd] = await Promise.all([
    getTranslations("inbox"),
    getTranslations("common"),
    getTranslations("inboundStatus"),
    getTranslations("inboundChannel"),
    getTranslations("inboxCommand"),
  ]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_messages")
    .select(
      "id, channel, kind, status, from_identity, received_at, ticket_id, disposition, spam_signals",
    )
    .order("received_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load inbound messages: ${error.message}`);
  }
  const rows = (data ?? []) as Pick<
    InboundMessageRow,
    | "id"
    | "channel"
    | "kind"
    | "status"
    | "from_identity"
    | "received_at"
    | "ticket_id"
    | "disposition"
    | "spam_signals"
  >[];

  // Triage: park suspected/confirmed spam in a collapsed fold, active first.
  const active = rows.filter((r) => !isSpamFolded(r));
  const spam = rows.filter((r) => isSpamFolded(r));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      {/* In-app command ingress (VC-1) — dictate/type a task, agent drafts it. */}
      <NewCommand />

      {/* Client uploader lives here so the harness ingress is one click away. */}
      <UploadVoicemail />

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {active.length > 0 ? (
            <Panel>{queueTable(active)}</Panel>
          ) : (
            <p className="text-ink-2 text-sm italic">{t("noActive")}</p>
          )}
          {spam.length > 0 ? (
            <Panel>
              <details>
                <summary className="text-ink-2 cursor-pointer text-sm font-medium">
                  {t("spamFold", { count: spam.length })}
                </summary>
                <div className="mt-3">{queueTable(spam)}</div>
              </details>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );

  /**
   * The queue itself. No wrapper box — the panel is the surface, and the
   * table draws its own row rules.
   */
  function queueTable(list: typeof rows) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("thChannel")}</TableHead>
            <TableHead>{t("thFrom")}</TableHead>
            <TableHead className="hidden sm:table-cell">
              {t("thReceived")}
            </TableHead>
            <TableHead>{t("thStatus")}</TableHead>
            <TableHead className="hidden md:table-cell">
              {t("thTicket")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => {
            const href = `/inbox/${r.id}`;
            return (
              <TableRow key={r.id} className="hover:bg-muted/50 cursor-pointer">
                <TableCell className="p-0">
                  <Link href={href} className="block px-2 py-2.5">
                    {r.kind === "command" ? (
                      <Badge variant="secondary" className="font-normal">
                        {t("commandBadge")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        {tChannel(r.channel)}
                      </Badge>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="p-0 font-mono text-xs">
                  <Link href={href} className="block px-2 py-2.5">
                    {r.from_identity ?? (
                      <span className="text-ink-3">{t("unknownSender")}</span>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="hidden p-0 text-sm sm:table-cell">
                  <Link href={href} className="block px-2 py-2.5">
                    {formatDateTime(r.received_at)}
                  </Link>
                </TableCell>
                <TableCell className="p-0">
                  <Link href={href} className="block px-2 py-2.5">
                    <Badge variant={INBOUND_STATUS_VARIANT[r.status]}>
                      {r.kind === "command"
                        ? tCmd(commandStatusKey(r.status))
                        : tStatus(r.status)}
                    </Badge>
                  </Link>
                </TableCell>
                <TableCell className="hidden p-0 text-sm md:table-cell">
                  <Link href={href} className="block px-2 py-2.5">
                    {r.ticket_id ? (
                      <span className="text-good">{t("ticketCreated")}</span>
                    ) : r.disposition === "handled" ? (
                      <span className="text-ink-3">{t("handledTag")}</span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }
}
