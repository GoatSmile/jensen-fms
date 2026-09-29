"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { addAgreementLines, isEndReason } from "@/lib/service-agreements/lines";
import { createServiceClient } from "@/lib/supabase/service";

/*
 * Lines by hand on the agreement page (migration 110): *Add bikes* and *End*.
 * Same writer as the document confirm, so the one-active-line rule is the same.
 * Each action checks `agreements` itself.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function addBikesToAgreement(
  agreementId: string,
  input: {
    bikeIds: string[];
    startDate: string;
    yearlyPrice: number | null;
    hasGps: boolean;
    moveBikeIds: string[];
  },
): Promise<{ ok: true; added: number; moved: number } | { ok: false; error: string }> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("agreements"))) {
    return { ok: false, error: t("saDocNeedsAgreements") };
  }
  if (!ISO.test(input.startDate)) return { ok: false, error: t("saDocInvalidDate") };
  if (
    input.yearlyPrice != null &&
    !(Number.isFinite(input.yearlyPrice) && input.yearlyPrice >= 0)
  ) {
    return { ok: false, error: t("saDocInvalidPrice") };
  }
  const supabase = createServiceClient();
  const { data: sa } = await supabase
    .from("service_agreements")
    .select("id, organization_id")
    .eq("id", agreementId)
    .maybeSingle();
  if (!sa) return { ok: false, error: t("saMissingAgreementId") };

  const result = await addAgreementLines(supabase, {
    agreementId,
    lines: input.bikeIds.map((bikeId) => ({ bikeId, startDate: input.startDate })),
    yearlyPrice: input.yearlyPrice,
    currency: "DKK",
    hasGps: input.hasGps,
    source: "manual",
    actorId: await readPersonId(),
    moveBikeIds: new Set(input.moveBikeIds),
  });
  if (result.error) return { ok: false, error: t("saDocCouldNotSave", { detail: result.error }) };
  if (result.conflicts.length > 0 && result.added === 0) {
    return { ok: false, error: t("saLineConflicts", { count: result.conflicts.length }) };
  }
  revalidatePath(`/service-agreements/${agreementId}`);
  revalidatePath(`/organizations/${sa.organization_id}`);
  revalidatePath("/bikes");
  return { ok: true, added: result.added, moved: result.moved };
}

/** End a line — the bike is no longer covered from `endedOn`. Nothing is credited. */
export async function endAgreementBike(
  lineId: string,
  input: { reason: string; endedOn: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("agreements"))) {
    return { ok: false, error: t("saDocNeedsAgreements") };
  }
  if (!isEndReason(input.reason)) return { ok: false, error: t("saLineInvalidReason") };
  if (!ISO.test(input.endedOn)) return { ok: false, error: t("saDocInvalidDate") };
  const supabase = createServiceClient();
  const { data: line } = await supabase
    .from("service_agreement_bikes")
    .select("id, agreement_id, bike_id, status")
    .eq("id", lineId)
    .maybeSingle();
  if (!line || line.status !== "active") return { ok: false, error: t("saLineNotFound") };
  const { error } = await supabase
    .from("service_agreement_bikes")
    .update({
      status: "ended",
      end_reason: input.reason,
      ended_on: input.endedOn,
      updated_at: new Date().toISOString(),
      last_actor_id: await readPersonId(),
    })
    .eq("id", lineId);
  if (error) return { ok: false, error: t("saDocCouldNotSave", { detail: error.message }) };
  revalidatePath(`/service-agreements/${line.agreement_id}`);
  revalidatePath(`/bikes/${line.bike_id}`);
  revalidatePath("/bikes");
  return { ok: true };
}
