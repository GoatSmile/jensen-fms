import Link from "next/link";
import { ChevronRight, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { elapsedShort } from "@/lib/work/elapsed";
import type { WorkOrderStatus } from "@/lib/maintenance/work-order-status";
import {
  loadBuildQueue,
  type BuildQueueBike,
} from "@/lib/manufacturing/bike-readiness";

export const dynamic = "force-dynamic";

/**
 * Unified workshop floor — the technician's home for BOTH jobs:
 *   - "To build" — bikes still in planning/building on open MOs, ready-first
 *     (parts in stock) with blocked ones greyed and reasoned. Tap → the build
 *     workbench.
 *   - "To repair" — open / in-progress work orders from maintenance.
 *
 * Two streams, switched by `?tab=` (URL-driven so a filtered view is a
 * shareable link, same convention as the list pages). Both card styles share
 * the stripe + colour-dot + frame-number language so a tech reads state at a
 * glance.
 */
export default async function WorkQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();

  const [woRes, buildQueue] = await Promise.all([
    supabase
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
      .order("created_at", { ascending: true }),
    loadBuildQueue(supabase),
  ]);

  if (woRes.error) {
    throw new Error(`Failed to load work queue: ${woRes.error.message}`);
  }

  // in_progress first, then open by created_at asc.
  const repairRows = (woRes.data ?? []).slice().sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "in_progress" ? -1 : 1;
    }
    return a.created_at.localeCompare(b.created_at);
  });

  const inProgressCount = repairRows.filter(
    (r) => r.status === "in_progress",
  ).length;
  const buildReadyCount = buildQueue.filter((b) => b.ready).length;

  // Default to "To build" (the stream this floor was missing) unless it's
  // empty while repairs are waiting — then land on repair so nobody stares at
  // an empty tab. Explicit ?tab= always wins.
  const activeTab =
    tab === "repair"
      ? "repair"
      : tab === "build"
        ? "build"
        : buildQueue.length === 0 && repairRows.length > 0
          ? "repair"
          : "build";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Workshop floor</h1>
        <Button asChild size="sm" variant="outline">
          <Link href="/scan">
            <ScanLine className="mr-1 size-4" aria-hidden /> Scan
          </Link>
        </Button>
      </header>

      <div
        role="tablist"
        className="bg-muted/40 flex gap-1 rounded-lg border p-1"
      >
        <TabLink
          active={activeTab === "build"}
          href="/work?tab=build"
          label="To build"
          count={buildQueue.length}
          sub={`${buildReadyCount} ready`}
        />
        <TabLink
          active={activeTab === "repair"}
          href="/work?tab=repair"
          label="To repair"
          count={repairRows.length}
          sub={`${inProgressCount} in progress`}
        />
      </div>

      {activeTab === "build" ? (
        <BuildStream bikes={buildQueue} />
      ) : repairRows.length === 0 ? (
        <EmptyState
          title="Nothing to repair"
          body="New work orders show up here automatically. Scan a bike to create one from a ticket."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {repairRows.map((wo) => {
            const status = wo.status as WorkOrderStatus;
            const inProgress = status === "in_progress";
            const templateLabel = wo.bike?.bike_template
              ? [wo.bike.bike_template.family, wo.bike.bike_template.frame_size]
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

function TabLink({
  active,
  href,
  label,
  count,
  sub,
}: {
  active: boolean;
  href: string;
  label: string;
  count: number;
  sub: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`flex flex-1 flex-col items-center rounded-md px-3 py-1.5 text-center transition-colors ${
        active
          ? "bg-background shadow-sm"
          : "text-muted-foreground hover:bg-background/50"
      }`}
    >
      <span className="text-sm font-medium">
        {label} <span className="tabular-nums">({count})</span>
      </span>
      <span className="text-muted-foreground text-[11px]">{sub}</span>
    </Link>
  );
}

function BuildStream({ bikes }: { bikes: BuildQueueBike[] }) {
  if (bikes.length === 0) {
    return (
      <EmptyState
        title="Nothing to build"
        body="Bikes on open manufacturing orders show up here. Create an MO and add bikes to start a batch."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {bikes.map((b) => (
        <li key={b.bikeId}>
          <Link
            href={`/manufacturing-orders/${b.moId}/bikes/${b.bikeId}/build`}
            className={`group relative flex items-stretch overflow-hidden rounded-lg border bg-card shadow-sm transition-colors hover:bg-muted/30 ${
              b.ready ? "" : "opacity-75"
            }`}
          >
            <div
              aria-hidden
              className={`w-1.5 shrink-0 ${
                b.ready ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
            <div className="flex-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-wider">
                      {b.moNumber}
                    </span>
                    {b.ready ? (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Ready
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {b.blockedReason}
                      </span>
                    )}
                    {!b.frameConfirmed ? (
                      <span className="text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                        frame to confirm
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <BikeColorDot hex={b.colorHex} label={b.colorName} />
                    <SegmentedId
                      value={b.frameNumber}
                      className="text-base font-semibold"
                    />
                  </div>
                  {b.templateLabel || b.ownerName ? (
                    <div className="text-muted-foreground text-xs">
                      {[b.templateLabel, b.ownerName]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center">
                  <ChevronRight
                    className="text-muted-foreground/60 size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-muted/30 flex flex-col items-center gap-2 rounded-md border p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground text-xs">{body}</p>
    </div>
  );
}

/**
 * Round, ringed dot showing the bike's painted colour. Falls back to a
 * neutral grey-with-diagonal-stripe when no colour is on file.
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
