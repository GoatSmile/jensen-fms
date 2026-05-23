import Link from "next/link";
import { ArrowRight, Bike, ScanLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  WO_STATUS_LABEL,
  WO_STATUS_VARIANT,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

export const dynamic = "force-dynamic";

/**
 * Workshop floor queue — the technician's home page. Lists every work
 * order that's open or in-progress, regardless of assignee (per-user
 * filtering arrives with M1 auth). Sorted in_progress first, then by
 * creation time so older WOs surface naturally.
 *
 * Designed for a phone held in one hand: big tap targets, single
 * column, no horizontal scroll. The detail page at /work/[woId] is
 * where the actual work happens.
 */
export default async function WorkQueuePage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("work_orders")
    .select(
      `
        id, wo_number, status, started_at, created_at,
        diagnosis,
        bike:bikes!bike_id(
          id, frame_number,
          bike_template:bike_templates(family, frame_size, name_en),
          owner_organization:organizations!owner_organization_id(
            id, legal_name, display_name_da, display_name_en
          )
        ),
        ticket:maintenance_tickets!ticket_id(id, ticket_number, priority)
      `,
    )
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load work queue: ${error.message}`);
  }

  // Status sort: in_progress first, then open. Then by created_at asc so
  // oldest open WOs float up.
  const rows = (data ?? []).slice().sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "in_progress" ? -1 : 1;
    }
    return a.created_at.localeCompare(b.created_at);
  });

  const inProgressCount = rows.filter((r) => r.status === "in_progress").length;
  const openCount = rows.length - inProgressCount;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Workshop floor
          </h1>
          <Button asChild size="sm" variant="outline">
            <Link href="/scan">
              <ScanLine className="mr-1 size-4" aria-hidden /> Scan
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {inProgressCount} in progress · {openCount} open
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-muted/30 flex flex-col items-center gap-2 rounded-md border p-8 text-center">
          <p className="text-sm font-medium">Nothing in the queue</p>
          <p className="text-muted-foreground text-xs">
            New work orders show up here automatically. Scan a bike to
            create one from a ticket.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((wo) => {
            const status = wo.status as WorkOrderStatus;
            const templateLabel = wo.bike?.bike_template
              ? [
                  wo.bike.bike_template.family,
                  wo.bike.bike_template.frame_size,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null;
            const ownerName =
              wo.bike?.owner_organization?.display_name_da ??
              wo.bike?.owner_organization?.display_name_en ??
              wo.bike?.owner_organization?.legal_name ??
              null;
            const diagnosisExcerpt =
              wo.diagnosis && wo.diagnosis.trim().length > 0
                ? wo.diagnosis.slice(0, 120)
                : null;

            return (
              <li key={wo.id}>
                <Link
                  href={`/work/${wo.id}`}
                  className="hover:bg-muted/40 flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-muted-foreground font-mono text-xs">
                        {wo.wo_number}
                      </span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <Bike
                          className="text-muted-foreground size-4 shrink-0"
                          aria-hidden
                        />
                        <span className="font-mono">
                          {wo.bike?.frame_number ?? "—"}
                        </span>
                      </span>
                      {templateLabel ? (
                        <span className="text-muted-foreground text-xs">
                          {templateLabel}
                        </span>
                      ) : null}
                      {ownerName ? (
                        <span className="text-muted-foreground text-xs">
                          {ownerName}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge variant={WO_STATUS_VARIANT[status]}>
                        {WO_STATUS_LABEL[status]}
                      </Badge>
                      <ArrowRight
                        className="text-muted-foreground size-4"
                        aria-hidden
                      />
                    </div>
                  </div>
                  {diagnosisExcerpt ? (
                    <p className="text-muted-foreground border-t pt-2 text-sm">
                      {diagnosisExcerpt}
                      {wo.diagnosis && wo.diagnosis.length > 120 ? "…" : ""}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
