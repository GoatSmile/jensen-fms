/**
 * The ONE writer of agreement bike lines (migration 110) — shared by the
 * document confirm and *Add bikes* on the agreement page, so the rule "a bike
 * is on at most one active line" is applied in one place (the partial unique
 * index backs it).
 *
 * A bike already active on THIS agreement is skipped. A bike active on
 * ANOTHER agreement is a conflict unless the caller asked to move it, in which
 * case the old line ends with reason `moved` today — never silently.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

export type NewLine = { bikeId: string; startDate: string };

export type AddLinesResult = {
  added: number;
  skipped: number;
  moved: number;
  conflicts: { bikeId: string; agreementId: string }[];
  error: string | null;
};

export async function addAgreementLines(
  supabase: SupabaseClient<Database>,
  args: {
    agreementId: string;
    lines: NewLine[];
    yearlyPrice: number | null;
    currency: string | null;
    hasGps: boolean;
    source: "document" | "manual";
    documentId?: string | null;
    actorId: string | null;
    /** Bikes the person chose to move here from another agreement. */
    moveBikeIds?: Set<string>;
  },
): Promise<AddLinesResult> {
  const result: AddLinesResult = { added: 0, skipped: 0, moved: 0, conflicts: [], error: null };
  const bikeIds = [...new Set(args.lines.map((l) => l.bikeId))];
  if (bikeIds.length === 0) return result;

  const { data: bikes, error: bikesErr } = await supabase
    .from("bikes")
    .select("id")
    .in("id", bikeIds)
    .is("deleted_at", null);
  if (bikesErr) return { ...result, error: bikesErr.message };
  const real = new Set((bikes ?? []).map((b) => b.id));

  const { data: active, error: activeErr } = await supabase
    .from("service_agreement_bikes")
    .select("id, bike_id, agreement_id")
    .eq("status", "active")
    .in("bike_id", bikeIds);
  if (activeErr) return { ...result, error: activeErr.message };
  const activeByBike = new Map((active ?? []).map((a) => [a.bike_id, a]));

  const today = new Date().toISOString().slice(0, 10);
  const inserts: Database["public"]["Tables"]["service_agreement_bikes"]["Insert"][] = [];
  const seen = new Set<string>();
  for (const l of args.lines) {
    if (!real.has(l.bikeId) || seen.has(l.bikeId)) continue;
    seen.add(l.bikeId);
    const cur = activeByBike.get(l.bikeId);
    if (cur && cur.agreement_id === args.agreementId) {
      result.skipped++;
      continue;
    }
    if (cur) {
      if (!args.moveBikeIds?.has(l.bikeId)) {
        result.conflicts.push({ bikeId: l.bikeId, agreementId: cur.agreement_id });
        continue;
      }
      const { error: endErr } = await supabase
        .from("service_agreement_bikes")
        .update({
          status: "ended",
          end_reason: "moved",
          ended_on: today,
          updated_at: new Date().toISOString(),
          last_actor_id: args.actorId,
        })
        .eq("id", cur.id);
      if (endErr) return { ...result, error: endErr.message };
      result.moved++;
    }
    inserts.push({
      agreement_id: args.agreementId,
      bike_id: l.bikeId,
      start_date: l.startDate,
      yearly_price: args.yearlyPrice,
      currency: args.yearlyPrice == null ? null : (args.currency ?? "DKK"),
      has_gps: args.hasGps,
      source: args.source,
      document_id: args.documentId ?? null,
      last_actor_id: args.actorId,
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("service_agreement_bikes").insert(inserts);
    if (error) return { ...result, error: error.message };
    result.added = inserts.length;
  }
  return result;
}

export const END_REASONS = ["stolen", "retired", "cancelled", "moved", "ended"] as const;
export type EndReason = (typeof END_REASONS)[number];

export function isEndReason(v: unknown): v is EndReason {
  return typeof v === "string" && (END_REASONS as readonly string[]).includes(v);
}
