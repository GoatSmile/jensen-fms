"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadOutboundBody } from "@/app/_actions/outbound-body";
import type { OutboundRow, OutboundStatus } from "@/lib/email/outbox-queries";
import { formatDateTime } from "@/lib/parts/format";

const STATUS_VARIANT: Record<
  OutboundStatus,
  "success" | "destructive" | "warning"
> = {
  sent: "success",
  failed: "destructive",
  // Written before the provider was called and never stamped — an attempt
  // whose outcome nobody saw, which is a real state, not a tidy one.
  pending: "warning",
};

/**
 * The sent-messages table, shared by an order's own panel and the admin
 * outbox. Metadata comes from the server render; the BODY is fetched only when
 * someone opens a message, and renders inside a sandboxed iframe so a stored
 * document's CSS cannot touch the app around it.
 */
export function OutboundMessageList({
  rows,
  showKind = false,
  inPanel = true,
}: {
  rows: OutboundRow[];
  /** The admin outbox mixes documents and notifications; an order does not. */
  showKind?: boolean;
  inPanel?: boolean;
}) {
  const t = useTranslations("outbox");
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<{ subject: string; html: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [active, setActive] = useState<OutboundRow | null>(null);

  function view(row: OutboundRow) {
    setActive(row);
    setBody(null);
    setError(null);
    setOpen(true);
    start(async () => {
      const r = await loadOutboundBody(row.id);
      if (r.ok) setBody({ subject: r.subject, html: r.html });
      else setError(r.error);
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title={t("emptyTitle")}
        description={t("emptyDesc")}
        inPanel={inPanel}
      />
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">{t("thWhen")}</TableHead>
            {showKind ? (
              <TableHead className="hidden sm:table-cell">
                {t("thKind")}
              </TableHead>
            ) : null}
            <TableHead>{t("thSubject")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("thTo")}</TableHead>
            <TableHead>{t("thStatus")}</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {formatDateTime(row.createdAt)}
                {row.actorName ? (
                  <div className="text-[10px]">{row.actorName}</div>
                ) : null}
              </TableCell>
              {showKind ? (
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline" className="font-normal">
                    {t.has(`kind_${row.kind}`)
                      ? t(`kind_${row.kind}`)
                      : row.kind}
                  </Badge>
                  {row.eventKey ? (
                    <div className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                      {row.eventKey}
                    </div>
                  ) : null}
                </TableCell>
              ) : null}
              {/* TableCell is whitespace-nowrap by default, and a provider's
                  complaint is a sentence — left alone it stretches the table
                  until Status and View are off the right edge. */}
              <TableCell className="min-w-[220px] text-sm whitespace-normal">
                {row.subject}
                {row.errorDetail ? (
                  <div className="text-destructive max-w-[42ch] text-xs">
                    {row.errorDetail}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {/* Empty for the notification rows carried over from the old
                    log: it kept the PERSON's address, which is who the mail
                    was FOR, never who the rerouted send reached. */}
                <div className="font-mono text-xs">
                  {row.to.length > 0 ? (
                    row.to.join(", ")
                  ) : (
                    <span className="text-muted-foreground">
                      {t("notRecorded")}
                    </span>
                  )}
                </div>
                {/* Test mode reroutes the send; "we emailed the painter" and
                    "we emailed ourselves instead" must not read the same. */}
                {row.testMode ? (
                  <div className="text-money text-[10px]">
                    {row.intended.length > 0
                      ? t("insteadOf", { intended: row.intended.join(", ") })
                      : t("testModeNoIntended")}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[row.status]}>
                  {t(`status_${row.status}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button size="xs" variant="outline" onClick={() => view(row)}>
                  {t("view")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{active?.subject ?? t("view")}</DialogTitle>
            <DialogDescription>
              {active
                ? t("sentTo", {
                    to: active.to.join(", "),
                    when: formatDateTime(active.createdAt),
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : pending || !body ? (
            <p className="text-muted-foreground text-sm">{t("loading")}</p>
          ) : (
            <iframe
              // Sandboxed with no allow-* flags: the stored document is inert
              // here — no scripts, no navigation, no styles reaching the app.
              sandbox=""
              srcDoc={body.html}
              title={body.subject}
              className="bg-surface border-rule h-[60vh] w-full rounded-md border"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
