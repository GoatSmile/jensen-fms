import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  CheckCircle2,
  ChevronRight,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Users,
  Voicemail,
} from "lucide-react";

import { danishTime } from "@/lib/calls/days";
import { formatPhone } from "@/lib/calls/lines";
import type { CallListRow } from "@/lib/calls/load";
import { cn } from "@/lib/utils";

import { CallAudio } from "./call-audio";
import { CallRowActions } from "./call-row-actions";

/**
 * One call as a sentence: time, direction, WHO (the customer when matched,
 * the number only when not), what it was about, what the workshop promised,
 * and the one likely next step. The body opens in place — a native
 * <details>, so it works before hydration and needs no state — with the
 * recording (signed on demand), the summary and a link to the full call.
 *
 * Colour by group, from the six-hue vocabulary: `brand` edge = to do,
 * `money` edge = check (caution), `alert` only for an URGENT to-do, done in
 * `good`, quiet rows in the muted inks. Never colour alone: every row also
 * says its reason in words. A call from one of our own numbers wears an
 * "Internal" tag in `system` (our own side) in EVERY group — the number no
 * longer decides the group, so the tag is how it stays visible.
 */
export async function CallRow({
  row,
  showLine,
  canOpenTickets,
}: {
  row: CallListRow;
  showLine: boolean;
  canOpenTickets: boolean;
}) {
  const t = await getTranslations("calls");
  const { lane, reason, urgent } = row.triage;
  const quiet = lane === "quiet";

  const Icon =
    lane === "done"
      ? CheckCircle2
      : reason === "internal"
        ? Users
        : reason === "missed"
          ? PhoneMissed
          : reason === "no_speech"
            ? PhoneOff
            : row.channel === "voicemail"
              ? Voicemail
              : row.direction === "outgoing"
                ? PhoneOutgoing
                : PhoneIncoming;

  const number = formatPhone(row.from_identity);
  const who = row.orgName ?? row.callerName ?? number ?? t("unknownCaller");
  const sub = [
    row.orgName && row.callerName ? row.callerName : null,
    row.orgName || row.callerName ? number : null,
    row.channel === "voicemail" ? t("voicemail") : row.direction === "outgoing" ? t("outgoing") : null,
    row.duration_seconds != null ? t("seconds", { s: row.duration_seconds }) : null,
    showLine ? row.lineName : null,
  ].filter(Boolean);

  const edge =
    lane === "todo"
      ? urgent
        ? "border-l-alert"
        : "border-l-brand"
      : lane === "check"
        ? "border-l-money"
        : "border-l-transparent";

  return (
    <li className={cn("flex flex-col gap-2 border-l-[3px] py-2.5 pr-3 pl-3 sm:flex-row sm:items-start", edge)}>
      <details className="group min-w-0 flex-1">
        <summary className="grid cursor-pointer list-none grid-cols-[3rem_1.25rem_minmax(0,1fr)] items-start gap-2 [&::-webkit-details-marker]:hidden">
          <span className={cn("pt-0.5 text-sm tabular-nums", quiet ? "text-ink-3" : "text-ink-2")}>
            {danishTime(row.received_at)}
          </span>
          <Icon
            aria-hidden
            className={cn(
              "mt-0.5 size-4",
              lane === "done"
                ? "text-good"
                : lane === "todo"
                  ? urgent
                    ? "text-alert"
                    : "text-brand"
                  : lane === "check"
                    ? "text-money"
                    : "text-ink-3",
            )}
          />
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 sm:flex-nowrap">
              <span className={cn("max-w-full truncate", quiet ? "text-ink-2" : "font-medium")}>{who}</span>
              {row.internal ? (
                <span className="bg-system-wash text-system inline-flex shrink-0 items-center gap-1 self-center rounded-full px-2 py-0.5 text-xs font-medium">
                  <Users aria-hidden className="size-3" />
                  {t("internalTag")}
                </span>
              ) : null}
              {/* On a phone the details take their own line, so the name is not squeezed. */}
              {sub.length ? (
                <span className="text-ink-3 order-last basis-full truncate text-xs sm:order-none sm:basis-auto">
                  {sub.join(" · ")}
                </span>
              ) : null}
              <ChevronRight
                aria-hidden
                className="text-ink-3 ml-auto size-3.5 shrink-0 transition-transform group-open:rotate-90"
              />
            </span>
            <span className={cn("block truncate text-sm", quiet ? "text-ink-3" : "text-ink-2")}>
              {lane === "todo" && urgent ? <strong className="text-alert">{t("urgent")} · </strong> : null}
              {lane === "check" || (quiet && reason !== "internal") ? <span>{t(`reason.${reason}`)}{row.summary ? " · " : ""}</span> : null}
              {row.summary ?? (lane === "todo" || reason === "internal" ? t(`reason.${reason}`) : "")}
            </span>
            {row.promises.length > 0 && !quiet ? (
              <span className="text-ink block truncate text-sm">
                {t("promised", { what: row.promises.join("; ") })}
              </span>
            ) : null}
          </span>
        </summary>

        <div className="mt-3 ml-[3.25rem] flex flex-col gap-3 sm:ml-[4.75rem]">
          {row.summary ? <p className="text-sm">{row.summary}</p> : null}
          {row.promises.length > 0 ? (
            <ul className="text-sm">
              {row.promises.map((p) => (
                <li key={p}>{t("promised", { what: p })}</li>
              ))}
            </ul>
          ) : null}
          {row.status === "failed" && row.error ? (
            <p className="text-ink-2 font-mono text-xs break-all">{row.error}</p>
          ) : null}
          {row.hasAudio ? <CallAudio messageId={row.id} /> : null}
          <Link href={`/calls/${row.id}`} className="text-brand-ink text-sm underline underline-offset-2">
            {t("openCall")}
          </Link>
        </div>
      </details>

      <CallRowActions
        id={row.id}
        lane={lane}
        reason={reason}
        ticketId={row.ticket_id}
        ticketHref={canOpenTickets && row.ticket_id ? `/maintenance/tickets/${row.ticket_id}` : null}
      />
    </li>
  );
}
