import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { OutboundMessageList } from "@/components/outbound-message-list";
import { loadOutbox } from "@/lib/email/outbox-queries";
import { FILTER_ACTIVE_CLASS } from "@/lib/filter-style";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const KINDS = ["purchase_order", "service_order", "offer", "notification"] as const;
const STATUSES = ["sent", "failed", "pending"] as const;
const LIMIT = 200;

export const dynamic = "force-dynamic";

/**
 * Every message the app has sent. Admin rather than a per-entity surface,
 * because the question it answers is "did anything go out, and did any of it
 * fail" — including notifications, which hang off no order at all.
 *
 * Newest first, capped: the outbox only ever grows, and nobody reads page 12.
 */
export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const [t, tCommon] = await Promise.all([
    getTranslations("outbox"),
    getTranslations("common"),
  ]);
  const kind =
    sp.kind && (KINDS as readonly string[]).includes(sp.kind) ? sp.kind : null;
  const status =
    sp.status && (STATUSES as readonly string[]).includes(sp.status)
      ? sp.status
      : null;

  const supabase = await createClient();
  const rows = await loadOutbox(supabase, { kind, status, limit: LIMIT });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
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
              <BreadcrumbPage>{t("adminTitle")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("adminTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("adminSubtitle")}</p>
        </div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="outbox-kind">
            {t("filterKind")}
          </label>
          <select
            id="outbox-kind"
            name="kind"
            defaultValue={kind ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              kind && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">{t("allKinds")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind_${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm" htmlFor="outbox-status">
            {t("filterStatus")}
          </label>
          <select
            id="outbox-status"
            name="status"
            defaultValue={status ?? ""}
            className={cn(
              "border-input bg-background h-9 rounded-md border px-2 text-sm",
              status && FILTER_ACTIVE_CLASS,
            )}
          >
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm">
          {t("apply")}
        </Button>
      </form>

      <Panel
        title={t("adminTitle")}
        description={
          rows.length === LIMIT
            ? t("cap", { count: LIMIT })
            : t("count", { count: rows.length })
        }
      >
        <OutboundMessageList rows={rows} showKind />
      </Panel>
    </div>
  );
}
