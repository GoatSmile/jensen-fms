"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { readHasCapability } from "@/lib/auth/read-session";
import { createWorkOrderInternal } from "@/lib/maintenance/create-work-order";
import { createClient } from "@/lib/supabase/server";

export type StartWOResult = { ok: false; error: string };

/**
 * The floor's "New work order": a technician standing at a bike — scanned, or
 * found by the code the customer read out — starts a repair with no ticket and
 * lands straight in `/work/<wo>`. The office form at /maintenance is not an
 * option for them: the Workshop role has no `maintenance` (migration 103).
 *
 * If the bike already has an OPEN work order, that one opens instead. Two open
 * orders on one bike split the time, the parts and the invoice across papers
 * nobody will reconcile.
 */
export async function startWorkOrderForBike(
  bikeId: string,
): Promise<StartWOResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("work"))) {
    return { ok: false, error: t("woStartNeedsWork") };
  }
  if (!bikeId) return { ok: false, error: t("woPickBike") };

  const supabase = await createClient();
  const [bikeRes, openRes] = await Promise.all([
    supabase
      .from("bikes")
      .select("id, status, deleted_at")
      .eq("id", bikeId)
      .maybeSingle(),
    supabase
      .from("work_orders")
      .select("id")
      .eq("bike_id", bikeId)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  if (bikeRes.error || !bikeRes.data) {
    return {
      ok: false,
      error: t("bikeCouldNotLoad", {
        detail: bikeRes.error?.message ?? t("notFound"),
      }),
    };
  }
  const bike = bikeRes.data;
  // Same rule as the office form's bike list (loadWOPickables).
  if (
    bike.deleted_at ||
    bike.status === "retired" ||
    bike.status === "lost_or_stolen"
  ) {
    return { ok: false, error: t("woBikeCannotTakeWork") };
  }

  const existing = openRes.data?.[0];
  if (existing) redirect(`/work/${existing.id}`);

  const result = await createWorkOrderInternal({
    bike_id: bikeId,
    ticket_id: null,
    language: "da",
    diagnosis: null,
    work_performed: null,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/work");
  revalidatePath(`/bikes/${bikeId}`);
  redirect(`/work/${result.workOrderId}`);
}
