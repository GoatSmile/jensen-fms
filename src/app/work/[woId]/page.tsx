import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bike } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  WO_STATUS_LABEL,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";
import { startedFullLabel } from "@/lib/work/elapsed";

import { Workspace } from "./_components/workspace";
import type { WOPartRow } from "./_components/parts-section";
import type { WOPhoto } from "./_components/photos-section";
import type { PartChoice } from "@/app/maintenance/work-orders/[id]/_components/wo-part-dialog";

export const dynamic = "force-dynamic";

/**
 * Per-WO technician workspace.
 *
 * Workshop-mode chrome:
 *   - Full-width status banner sticks to the top while the tech
 *     scrolls (azure for in_progress, amber for open, emerald for
 *     completed, slate for cancelled). Shows "Started 14:32 · 23 min
 *     ago" for in-progress WOs so the tech has a running sense of
 *     time spent.
 *   - Hero header below: WO number caps, big mono frame number with a
 *     bike-colour dot beside it, customer name + ticket excerpt.
 *
 * The form sections (Diagnosis, Work performed, Parts, Photos) and
 * the bottom action bar live in the <Workspace /> client component
 * below; this page just frames them.
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
          color:colors(name_en, hex),
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

  const [woPartsRes, partsCatalogRes, photosRes] = await Promise.all([
    supabase
      .from("work_order_parts")
      .select(
        `id, part_id, quantity, unit_price, installed_at,
         part:parts!part_id(id, internal_sku, name_en)`,
      )
      .eq("work_order_id", wo.id)
      .order("installed_at", { ascending: true }),
    supabase
      .from("parts")
      .select("id, internal_sku, name_en, category:part_categories(name_en)")
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
    supabase
      .from("attachments")
      .select("id, file_url, file_name")
      .eq("entity_type", "work_order")
      .eq("entity_id", wo.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const partsCatalog: PartChoice[] = (partsCatalogRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
    category_name: p.category?.name_en ?? null,
  }));

  const lastCostByPartId = new Map<string, number>();
  const allPartIds = partsCatalog.map((p) => p.id);
  if (allPartIds.length > 0) {
    const { data: costs } = await supabase
      .from("v_part_last_cost")
      .select("part_id, last_cost_dkk")
      .in("part_id", allPartIds);
    for (const row of costs ?? []) {
      if (row.part_id != null && row.last_cost_dkk != null) {
        lastCostByPartId.set(row.part_id, Number(row.last_cost_dkk));
      }
    }
  }

  const partRows: WOPartRow[] = (woPartsRes.data ?? []).map((r) => ({
    id: r.id,
    partId: r.part_id,
    partSku: r.part?.internal_sku ?? "—",
    partName: r.part?.name_en ?? "—",
    quantity: Number(r.quantity),
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  }));

  const photos: WOPhoto[] = (photosRes.data ?? []).map((p) => ({
    id: p.id,
    fileUrl: p.file_url,
    fileName: p.file_name,
  }));

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
  const colorHex =
    wo.bike?.color?.hex && /^#[0-9a-fA-F]{6}$/.test(wo.bike.color.hex)
      ? wo.bike.color.hex
      : null;
  const colorName = wo.bike?.color?.name_en ?? null;

  // Status-banner classes. Workshop-mode tokens — not the generic
  // shadcn Badge variants — so they read as "state of work" rather
  // than "danger / warning."
  const bannerClass =
    status === "in_progress"
      ? "bg-blue-600 text-white"
      : status === "open"
        ? "bg-amber-500 text-amber-950"
        : status === "completed"
          ? "bg-emerald-600 text-white"
          : "bg-slate-400 text-white";

  const bannerSubtitle =
    status === "in_progress" && wo.started_at
      ? startedFullLabel(wo.started_at)
      : status === "completed" && wo.completed_at
        ? `Completed ${startedFullLabel(wo.completed_at, { includeElapsed: false })}`
        : status === "open" && wo.created_at
          ? `Created ${startedFullLabel(wo.created_at)}`
          : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-24 sm:p-6 sm:pb-28">
      <div className="flex items-center justify-between gap-2 pb-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/work">
            <ArrowLeft className="mr-1 size-4" aria-hidden /> Queue
          </Link>
        </Button>
      </div>

      {/* Sticky header card — banner (full-width inside the card) sits
          flush with the top of the rounded container; hero header sits
          below it. Both scroll together; the whole card is `sticky
          top-0` so it stays visible while the tech edits notes below. */}
      <header className="bg-card sticky top-0 z-10 overflow-hidden rounded-lg border shadow-sm">
        <div
          className={`flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider ${bannerClass}`}
        >
          <span className="flex items-center gap-2">
            {status === "in_progress" ? (
              <span
                aria-hidden
                className="size-2 animate-pulse rounded-full bg-white/90"
              />
            ) : null}
            {WO_STATUS_LABEL[status]}
          </span>
          {bannerSubtitle ? (
            <span className="text-xs font-medium tabular-nums opacity-90">
              {bannerSubtitle}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 px-4 py-4">
          <span className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-wider">
            {wo.wo_number}
          </span>
          <div className="flex items-center gap-3">
            <BikeColorDot hex={colorHex} label={colorName} />
            <span className="font-mono text-3xl font-bold tracking-tight">
              {wo.bike?.frame_number ?? "—"}
            </span>
          </div>
          {templateLabel ? (
            <span className="text-muted-foreground text-sm">
              {templateLabel}
            </span>
          ) : null}
          {ownerName ? (
            <div className="flex items-center gap-1.5">
              <Bike className="text-muted-foreground size-3.5" aria-hidden />
              <Link
                href={
                  wo.bike?.owner_organization?.id
                    ? `/organizations/${wo.bike.owner_organization.id}`
                    : "#"
                }
                className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
              >
                {ownerName}
              </Link>
            </div>
          ) : null}
          {wo.ticket ? (
            <p className="bg-muted/40 text-muted-foreground mt-2 rounded-md px-3 py-2 text-xs">
              From ticket{" "}
              <Link
                href={`/maintenance/tickets/${wo.ticket.id}`}
                className="hover:text-foreground font-mono underline-offset-4 hover:underline"
              >
                {wo.ticket.ticket_number}
              </Link>
              {wo.ticket.description
                ? `: "${wo.ticket.description.slice(0, 140)}${wo.ticket.description.length > 140 ? "…" : ""}"`
                : ""}
            </p>
          ) : null}
        </div>
      </header>

      <Workspace
        woId={wo.id}
        woNumber={wo.wo_number}
        status={status}
        language={language}
        initialDiagnosis={wo.diagnosis ?? ""}
        initialWorkPerformed={wo.work_performed ?? ""}
        bikeId={wo.bike?.id ?? null}
        partRows={partRows}
        partsCatalog={partsCatalog}
        lastCostByPartId={lastCostByPartId}
        photos={photos}
      />
    </div>
  );
}

function BikeColorDot({
  hex,
  label,
}: {
  hex: string | null;
  label: string | null;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      className="ring-foreground/15 inline-block size-5 shrink-0 rounded-full ring-1 ring-inset"
      style={
        hex
          ? { backgroundColor: hex }
          : {
              backgroundImage:
                "repeating-linear-gradient(45deg, #e2e8f0 0 3px, #cbd5e1 3px 6px)",
            }
      }
    />
  );
}
