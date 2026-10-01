import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  ChevronRight,
  CircleUser,
  PaintBucket,
  Search,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { localizedName } from "@/i18n/vocab";
import { readGate } from "@/lib/auth/read-session";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { elapsedShort } from "@/lib/work/elapsed";
import {
  loadWorkSearchBikes,
  searchWorkBikeIds,
  WORK_SEARCH_BIKE_LIMIT,
  type WorkSearchBike,
} from "@/lib/work/search";
import { StartWorkOrderButton } from "./_components/start-wo-button";
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
 *
 * `?q=` searches the repairs by what a phone call starts with — the code on
 * the bike's label, a frame number, the customer's name, or the WO number —
 * and lists the matching bikes that have no open order, each with a "New work
 * order". Searching always shows the repair tab.
 */
export default async function WorkQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mine?: string; q?: string }>;
}) {
  const { tab, mine, q: qRaw } = await searchParams;
  const q = qRaw?.trim() ?? "";
  const [t, locale, gate] = await Promise.all([
    getTranslations("work"),
    getLocale(),
    readGate(),
  ]);
  // Who is logged in — enables the "Mine" filter on repairs.
  const myPersonId = gate.kind === "session" ? gate.session.person : null;
  const mineActive = mine === "1" && myPersonId !== null;
  const supabase = await createClient();

  const [woRes, buildQueue, search, readyRes, paintRunRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        `
        id, wo_number, status, started_at, created_at, assigned_to,
        diagnosis,
        bike:bikes!bike_id(
          id, frame_number,
          color:colors(name_en, name_da, hex),
          bike_template:bike_templates(family:bike_families(name), frame_size, name_en),
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
    q ? searchWorkBikeIds(supabase, q) : Promise.resolve(null),
    // Orders ready to hand over — the delivery notes (migration 107).
    supabase
      .from("sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready"),
    // Paint runs for the floor: to drop off, or at the painter (migration 106).
    supabase
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["confirmed", "at_supplier", "ready"]),
  ]);
  const readyCount = readyRes.count ?? 0;
  const paintRunCount = paintRunRes.count ?? 0;

  if (woRes.error) {
    throw new Error(`Failed to load work queue: ${woRes.error.message}`);
  }

  // Assignee names for the repair cards (one query for the set shown).
  const assignedIds = [
    ...new Set(
      (woRes.data ?? []).map((r) => r.assigned_to).filter(Boolean) as string[],
    ),
  ];
  const assigneeNameById = new Map<string, string>();
  if (assignedIds.length > 0) {
    const { data: assignees } = await supabase
      .from("people")
      .select("id, full_name")
      .in("id", assignedIds);
    for (const p of assignees ?? []) assigneeNameById.set(p.id, p.full_name);
  }

  // in_progress first, then open by created_at asc. "Mine" narrows to the
  // session person's assignments (URL-driven, like every list filter).
  const qUpper = q.toLocaleUpperCase("da-DK");
  const repairRows = (woRes.data ?? [])
    .filter((r) => !mineActive || r.assigned_to === myPersonId)
    .filter(
      (r) =>
        !search ||
        (r.bike?.id != null && search.ids.has(r.bike.id)) ||
        r.wo_number.toLocaleUpperCase("da-DK").includes(qUpper),
    )
    .slice()
    .sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "in_progress" ? -1 : 1;
    }
    return a.created_at.localeCompare(b.created_at);
  });

  // Search hits that have no open order yet — where the floor starts one.
  let otherBikes: WorkSearchBike[] = [];
  let otherBikesTotal = 0;
  if (search) {
    const withOpenWO = new Set(
      (woRes.data ?? []).map((r) => r.bike?.id).filter(Boolean) as string[],
    );
    const others = [...search.ids].filter((id) => !withOpenWO.has(id));
    otherBikes = await loadWorkSearchBikes(supabase, others, others.length);
    otherBikesTotal = otherBikes.length;
    otherBikes = otherBikes.slice(0, WORK_SEARCH_BIKE_LIMIT);
  }

  const inProgressCount = repairRows.filter(
    (r) => r.status === "in_progress",
  ).length;
  const buildReadyCount = buildQueue.filter((b) => b.ready).length;

  // Default to "To build" (the stream this floor was missing) unless it's
  // empty while repairs are waiting — then land on repair so nobody stares at
  // an empty tab. Explicit ?tab= always wins.
  const activeTab =
    q || tab === "repair"
      ? "repair"
      : tab === "build"
        ? "build"
        : buildQueue.length === 0 && repairRows.length > 0
          ? "repair"
          : "build";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/work/paint-runs">
              <PaintBucket className="mr-1 size-4" aria-hidden />{" "}
              {t("paintRuns", { count: paintRunCount })}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/work/deliveries">
              <Truck className="mr-1 size-4" aria-hidden />{" "}
              {t("deliveries", { count: readyCount })}
            </Link>
          </Button>
          {/* No Scan here: it lives in the assistant's panel, behind the one
              floating button (owner, 2026-10-01). */}
        </div>
      </header>

      <form action="/work" method="get" role="search" className="flex gap-2">
        <input type="hidden" name="tab" value="repair" />
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            autoComplete="off"
            className="h-11 pl-9 text-base"
          />
        </div>
        <Button type="submit" className="h-11">
          {t("searchSubmit")}
        </Button>
        {q ? (
          <Button asChild variant="ghost" className="h-11" aria-label={t("searchClear")}>
            <Link href="/work?tab=repair">
              <X className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </form>

      <div
        role="tablist"
        className="bg-muted/40 flex gap-1 rounded-lg border p-1"
      >
        <TabLink
          active={activeTab === "build"}
          href="/work?tab=build"
          label={t("toBuild")}
          count={buildQueue.length}
          sub={t("readySub", { count: buildReadyCount })}
        />
        <TabLink
          active={activeTab === "repair"}
          href="/work?tab=repair"
          label={t("toRepair")}
          count={repairRows.length}
          sub={t("inProgressSub", { count: inProgressCount })}
        />
      </div>

      {activeTab === "repair" && myPersonId ? (
        <div className="flex items-center gap-1.5">
          <FilterChip
            active={!mineActive}
            href="/work?tab=repair"
            label={t("filterAll")}
          />
          <FilterChip
            active={mineActive}
            href="/work?tab=repair&mine=1"
            label={t("filterMine")}
          />
        </div>
      ) : null}

      {search?.error ? (
        <p className="bg-alert-wash text-alert rounded-lg p-3 text-sm" role="alert">
          {t("searchError", { detail: search.error })}
        </p>
      ) : null}

      {activeTab === "build" ? (
        <BuildStream bikes={buildQueue} t={t} />
      ) : q && repairRows.length === 0 && otherBikes.length === 0 ? (
        <EmptyState
          title={t("searchEmptyTitle", { q })}
          body={t("searchEmptyBody")}
        />
      ) : q && repairRows.length === 0 ? null : repairRows.length === 0 ? (
        <EmptyState
          title={t("emptyRepairTitle")}
          body={t("emptyRepairBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {repairRows.map((wo) => {
            const status = wo.status as WorkOrderStatus;
            const inProgress = status === "in_progress";
            const templateLabel = wo.bike?.bike_template
              ? [wo.bike.bike_template.family?.name, wo.bike.bike_template.frame_size]
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
            const colorName =
              localizedName(
                locale,
                wo.bike?.color?.name_en,
                wo.bike?.color?.name_da,
              ) || null;
            const elapsed =
              inProgress && wo.started_at ? elapsedShort(wo.started_at) : null;

            return (
              <li key={wo.id}>
                <Link
                  href={`/work/${wo.id}`}
                  className={`group relative flex items-stretch overflow-hidden rounded-lg border bg-card shadow-sm transition-colors hover:bg-muted/30 ${inProgress ? "from-brand/[0.04] bg-gradient-to-r to-transparent" : ""}`}
                >
                  <div
                    aria-hidden
                    className={`w-1.5 shrink-0 ${
                      inProgress ? "bg-brand" : "bg-money"
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
                            <span className="rounded-full bg-brand-wash px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink">
                              {t("chipInProgress")}
                            </span>
                          ) : (
                            <span className="rounded-full bg-money-wash px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-money">
                              {t("chipOpen")}
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
                          <span className="rounded-md bg-brand-wash px-2 py-0.5 text-[11px] font-medium tabular-nums text-brand-ink">
                            {elapsed}
                          </span>
                        ) : null}
                        {wo.assigned_to &&
                        assigneeNameById.has(wo.assigned_to) ? (
                          <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                            <CircleUser className="size-3" aria-hidden />
                            {assigneeNameById.get(wo.assigned_to)}
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

      {activeTab === "repair" && otherBikes.length > 0 ? (
        <SearchBikes
          bikes={otherBikes}
          total={otherBikesTotal}
          t={t}
        />
      ) : null}
    </div>
  );
}

/**
 * Bikes the search found with no open work order — each one a "New work
 * order" away. Not links to the bike page: the floor's next step is the
 * repair, and the bike page is one tap further for anyone who needs it.
 */
function SearchBikes({
  bikes,
  total,
  t,
}: {
  bikes: WorkSearchBike[];
  total: number;
  t: Awaited<ReturnType<typeof getTranslations<"work">>>;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
        {t("searchBikesTitle")}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {bikes.map((b) => (
          <li
            key={b.id}
            className="bg-card flex items-center justify-between gap-3 rounded-lg border p-4 shadow-sm"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {b.recognitionCode ? (
                  <span className="bg-muted rounded-md px-1.5 py-0.5 font-mono text-sm font-semibold">
                    {b.recognitionCode}
                  </span>
                ) : null}
                <Link
                  href={`/bikes/${b.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  <SegmentedId
                    value={b.frameNumber}
                    className="text-sm font-medium"
                  />
                </Link>
              </div>
              {b.templateLabel || b.ownerName ? (
                <div className="text-muted-foreground text-xs">
                  {[b.templateLabel, b.ownerName].filter(Boolean).join(" · ")}
                </div>
              ) : null}
            </div>
            <StartWorkOrderButton bikeId={b.id} variant="outline" />
          </li>
        ))}
      </ul>
      {total > bikes.length ? (
        <p className="text-muted-foreground text-xs">
          {t("searchBikesMore", { count: total - bikes.length })}
        </p>
      ) : null}
    </section>
  );
}

function FilterChip({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted/50"
      }`}
    >
      {label}
    </Link>
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

function BuildStream({
  bikes,
  t,
}: {
  bikes: BuildQueueBike[];
  t: Awaited<ReturnType<typeof getTranslations<"work">>>;
}) {
  if (bikes.length === 0) {
    return (
      <EmptyState title={t("emptyBuildTitle")} body={t("emptyBuildBody")} />
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
                b.ready ? "bg-good" : "bg-ink-3"
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
                      <span className="rounded-full bg-good-wash px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-good">
                        {t("chipReady")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-money-wash px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-money">
                        {b.atSupplier
                          ? t("chipAtPainter")
                          : b.shortfallCount > 0
                            ? t("chipPartsShort", { count: b.shortfallCount })
                            : t("chipNeedsPaint", { count: b.needsPaintCount })}
                      </span>
                    )}
                    {!b.frameConfirmed ? (
                      <span className="text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                        {t("chipFrameToConfirm")}
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
                  {b.buildNote ? (
                    <div className="mt-1 flex items-start gap-1 text-money">
                      <Tag className="mt-0.5 size-3 shrink-0" aria-hidden />
                      <span className="line-clamp-2 text-xs" title={b.buildNote}>
                        {b.buildNote}
                      </span>
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
    <Panel contentClassName="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground text-xs">{body}</p>
    </Panel>
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
