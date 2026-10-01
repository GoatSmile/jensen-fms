import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/empty-state";
import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { INBOUND_STATUS_VARIANT, commandStatusKey } from "@/lib/inbound/types";
import { parseCommandPlan } from "@/lib/inbound/command/plan";
import { formatDateTime } from "@/lib/parts/format";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Dictated commands, newest first — the history behind the Dictate button in
 * the app chrome. Commands left the inbox when it became Calls (DECISIONS
 * 2026-09-29): a command is something a person asked the system to draft,
 * not a call to work through.
 */
export default async function CommandsPage() {
  // The office sees every request; anyone else their own (mayReadCommand).
  const seesAll = await readHasCapability("inbox");
  const personId = seesAll ? null : await readPersonId();
  if (!seesAll && !personId) redirect("/");
  const [t, tc, tCommon] = await Promise.all([
    getTranslations("calls"),
    getTranslations("inboxCommand"),
    getTranslations("common"),
  ]);
  let query = createServiceClient()
    .from("inbound_messages")
    .select("id, status, body_text, received_at, command_plan")
    .eq("kind", "command")
    .order("received_at", { ascending: false })
    .limit(200);
  if (!seesAll && personId) query = query.eq("commanded_by", personId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load commands: ${error.message}`);
  const rows = data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("commandsTitle")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("commandsTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("commandsSubtitle")}</p>
      </header>
      {rows.length === 0 ? (
        <EmptyState icon={Sparkles} title={t("commandsEmptyTitle")} description={t("commandsEmptyDesc")} />
      ) : (
        <Panel contentClassName="p-0">
          <ul className="divide-rule divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/commands/${r.id}`} className="hover:bg-ink/5 flex items-start gap-3 px-4 py-3">
                  <span className="text-ink-2 w-36 shrink-0 text-sm tabular-nums">
                    {formatDateTime(r.received_at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.body_text ?? "—"}</span>
                  <Badge variant={INBOUND_STATUS_VARIANT[r.status]}>{tc(commandStatusKey(r.status, parseCommandPlan(r.command_plan).actions.length > 0))}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
