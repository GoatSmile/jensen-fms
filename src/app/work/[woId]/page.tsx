import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bike, Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  WO_STATUS_LABEL,
  WO_STATUS_VARIANT,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

import { Workspace } from "./_components/workspace";

export const dynamic = "force-dynamic";

/**
 * Per-WO technician workspace. Sticky bike header, status action bar
 * (Start / Mark done), diagnosis + work-performed editors with voice
 * dictation, parts list.
 *
 * Reuses the existing transition-wo and update-wo-details server
 * actions — this is a new front-end, not new business logic.
 */
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ woId: string }>;
}) {
  const { woId } = await params;
  const supabase = await createClient();

  const { data: wo, error } = await supabase
    .from("work_orders")
    .select(
      `
        id, wo_number, status, language,
        diagnosis, work_performed,
        labor_minutes, labor_rate_dkk, is_billable,
        started_at, completed_at, created_at,
        bike:bikes!bike_id(
          id, frame_number,
          bike_type:bike_types(name_en),
          bike_template:bike_templates(family, frame_size, name_en),
          owner_organization:organizations!owner_organization_id(
            id, legal_name, display_name_da, display_name_en
          )
        ),
        ticket:maintenance_tickets!ticket_id(
          id, ticket_number, status, priority, description
        )
      `,
    )
    .eq("id", woId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load work order: ${error.message}`);
  }
  if (!wo) notFound();

  const status = wo.status as WorkOrderStatus;
  const language: "da" | "en" = wo.language === "en" ? "en" : "da";
  const ownerName =
    wo.bike?.owner_organization?.display_name_da ??
    wo.bike?.owner_organization?.display_name_en ??
    wo.bike?.owner_organization?.legal_name ??
    null;
  const templateLabel = wo.bike?.bike_template
    ? [
        wo.bike.bike_template.family,
        wo.bike.bike_template.frame_size,
        wo.bike.bike_template.name_en,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-24 sm:p-6 sm:pb-28">
      <div className="flex items-center justify-between gap-2 pb-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/work">
            <ArrowLeft className="mr-1 size-4" aria-hidden /> Queue
          </Link>
        </Button>
        <Badge variant={WO_STATUS_VARIANT[status]}>
          {WO_STATUS_LABEL[status]}
        </Badge>
      </div>

      {/* Sticky bike header — always visible while the tech scrolls
          through the editor sections below. */}
      <header className="bg-card sticky top-0 z-10 flex flex-col gap-1 rounded-lg border p-4 shadow-sm">
        <span className="text-muted-foreground font-mono text-xs">
          {wo.wo_number}
        </span>
        <div className="flex items-center gap-2">
          <Bike className="text-muted-foreground size-5" aria-hidden />
          <span className="font-mono text-lg font-semibold">
            {wo.bike?.frame_number ?? "—"}
          </span>
        </div>
        {templateLabel ? (
          <span className="text-muted-foreground text-xs">{templateLabel}</span>
        ) : null}
        {ownerName ? (
          <div className="flex items-center gap-1.5">
            <Building2
              className="text-muted-foreground size-3.5"
              aria-hidden
            />
            <Link
              href={
                wo.bike?.owner_organization?.id
                  ? `/organizations/${wo.bike.owner_organization.id}`
                  : "#"
              }
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              {ownerName}
            </Link>
          </div>
        ) : null}
        {wo.ticket ? (
          <p className="text-muted-foreground mt-2 border-t pt-2 text-xs">
            From ticket{" "}
            <Link
              href={`/maintenance/tickets/${wo.ticket.id}`}
              className="hover:text-foreground font-mono underline-offset-4 hover:underline"
            >
              {wo.ticket.ticket_number}
            </Link>
            {wo.ticket.description ? `: ${wo.ticket.description.slice(0, 120)}` : ""}
            {wo.ticket.description && wo.ticket.description.length > 120
              ? "…"
              : ""}
          </p>
        ) : null}
      </header>

      <Workspace
        woId={wo.id}
        woNumber={wo.wo_number}
        status={status}
        language={language}
        initialDiagnosis={wo.diagnosis ?? ""}
        initialWorkPerformed={wo.work_performed ?? ""}
        bikeId={wo.bike?.id ?? null}
      />
    </div>
  );
}
