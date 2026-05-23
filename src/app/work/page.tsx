import Link from "next/link";
import { ChevronRight, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { elapsedShort } from "@/lib/work/elapsed";
import type { WorkOrderStatus } from "@/lib/maintenance/work-order-status";

export const dynamic = "force-dynamic";

/**
 * Workshop-mode queue. Each WO card has:
 *   - 6px status stripe on the left (azure = in_progress, amber = open)
 *   - Subtle blue tint on in-progress cards so they pop against the
 *     quieter open cards
 *   - Bike colour dot to the left of the frame number (physical
 *     metaphor — the actual painted colour of the bike on the bench)
 *   - Elapsed-time pill top-right for in-progress WOs (e.g. "23 min")
 *   - Status pill near the WO number for redundancy with the stripe
 *
 * The pattern is content-only — sidebar / chrome stay the same.
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
          color:colors(name_en, hex),
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
            const inProgress = status === "in_progress";
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
            const colorHex = wo.bike?.color?.hex ?? null;
            const colorName = wo.bike?.color?.name_en ?? null;
            const elapsed =
              inProgress && wo.started_at ? elapsedShort(wo.started_at) : null;

            return (
              <li key={wo.id}>
                <Link
                  href={`/work/${wo.id}`}
                  className={`group relative flex items-stretch overflow-hidden rounded-lg border bg-card shadow-sm transition-colors hover:bg-muted/30 ${inProgress ? "bg-gradient-to-r from-blue-600/[0.04] to-transparent" : ""}`}
                >
                  {/* 6px status stripe. Maps the WO status to a
                      Tailwind tone so a tech scanning the queue picks
                      up state without reading a word. */}
                  <div
                    aria-hidden
                    className={`w-1.5 shrink-0 ${
                      inProgress ? "bg-blue-600" : "bg-amber-500"
                    }`}
                  />

                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-wider">
                            {wo.wo_number}
                          </span>
                          {inProgress ? (
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800">
                              In progress
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              Open
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Bike colour dot — matches the painted
                              colour of the actual bike for physical
                              recognition on the bench. */}
                          <BikeColorDot hex={colorHex} label={colorName} />
                          <SegmentedId
                            value={wo.bike?.frame_number ?? "—"}
                            className="text-base font-semibold"
                          />
                        </div>
                        {templateLabel || ownerName ? (
                          <div className="text-muted-foreground text-xs">
                            {[templateLabel, ownerName]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                        {diagnosisExcerpt ? (
                          <p className="text-muted-foreground mt-2 border-t pt-2 text-sm">
                            {diagnosisExcerpt}
                            {wo.diagnosis && wo.diagnosis.length > 120
                              ? "…"
                              : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {elapsed ? (
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-blue-700">
                            {elapsed}
                          </span>
                        ) : null}
                        <ChevronRight
                          className="text-muted-foreground/60 size-4 transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Round, ringed dot showing the bike's painted colour. Falls back to a
 * neutral grey-with-diagonal-stripe when no colour is on file, so the
 * spot is always present (consistent left-of-frame-number layout).
 */
function BikeColorDot({
  hex,
  label,
}: {
  hex: string | null;
  label: string | null;
}) {
  const safe = hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      className="ring-foreground/15 inline-block size-3 shrink-0 rounded-full ring-1 ring-inset"
      style={
        safe
          ? { backgroundColor: safe }
          : {
              backgroundImage:
                "repeating-linear-gradient(45deg, #e2e8f0 0 2px, #cbd5e1 2px 4px)",
            }
      }
    />
  );
}
