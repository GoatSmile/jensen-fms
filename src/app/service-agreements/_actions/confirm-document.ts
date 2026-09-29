"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { isContractType } from "@/lib/service-agreements/documents/reading";
import { addAgreementLines } from "@/lib/service-agreements/lines";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/types/database";

export type ConfirmDocumentInput = {
  target:
    | { kind: "existing"; agreementId: string }
    | { kind: "new"; name: string; unitId: string | null };
  contractType: string | null;
  signedOn: string | null;
  signatories: string | null;
  yearlyPrice: number | null;
  hasGps: boolean;
  /** Start date for the new lines — the anniversary each bike renews on. */
  startDate: string;
  bikeIds: string[];
  /** Of `bikeIds`, the ones to MOVE here from another agreement. */
  moveBikeIds: string[];
};

export type ConfirmDocumentResult =
  | { ok: true; agreementId: string; added: number; moved: number; skipped: number }
  | { ok: false; error: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dennis confirms what the document says (migration 110). This is the ONLY
 * place a document's reading reaches an agreement — the model proposed, a
 * person decides, and the values arrive here from his form, not from the
 * stored reading. Creates the agreement when he chose *new agreement*, stamps
 * the paper's terms on it, and adds a line per ticked bike through the one
 * line writer.
 */
export async function confirmAgreementDocument(
  documentId: string,
  input: ConfirmDocumentInput,
): Promise<ConfirmDocumentResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("agreements"))) {
    return { ok: false, error: t("saDocNeedsAgreements") };
  }
  const contractType = input.contractType || null;
  if (contractType && !isContractType(contractType)) {
    return { ok: false, error: t("saDocInvalidContractType") };
  }
  const signedOn = input.signedOn || null;
  if ((signedOn && !ISO.test(signedOn)) || !ISO.test(input.startDate)) {
    return { ok: false, error: t("saDocInvalidDate") };
  }
  const yearlyPrice = input.yearlyPrice;
  if (yearlyPrice != null && !(Number.isFinite(yearlyPrice) && yearlyPrice >= 0)) {
    return { ok: false, error: t("saDocInvalidPrice") };
  }
  const signatories = input.signatories?.trim() || null;

  const supabase = createServiceClient();
  const actorId = await readPersonId();
  const { data: doc } = await supabase
    .from("service_agreement_documents")
    .select("id, status, organization_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: t("saDocNotFound") };
  if (doc.status === "confirmed") return { ok: false, error: t("saDocAlreadyConfirmed") };

  // A bike already on ANOTHER agreement moves only when he said so. Checked
  // before anything is written, so a refusal leaves no half-made agreement.
  const move = new Set(input.moveBikeIds);
  const bikeIds = [...new Set(input.bikeIds)];
  const targetId = input.target.kind === "existing" ? input.target.agreementId : null;
  if (bikeIds.length > 0) {
    const { data: active, error } = await supabase
      .from("service_agreement_bikes")
      .select("bike_id, agreement_id")
      .eq("status", "active")
      .in("bike_id", bikeIds);
    if (error) return { ok: false, error: t("saDocCouldNotSave", { detail: error.message }) };
    const conflicts = (active ?? []).filter(
      (a) => a.agreement_id !== targetId && !move.has(a.bike_id),
    );
    if (conflicts.length > 0) {
      return { ok: false, error: t("saLineConflicts", { count: conflicts.length }) };
    }
  }

  let agreementId: string;
  if (input.target.kind === "existing") {
    const { data: sa } = await supabase
      .from("service_agreements")
      .select("id")
      .eq("id", input.target.agreementId)
      .eq("organization_id", doc.organization_id)
      .maybeSingle();
    if (!sa) return { ok: false, error: t("saDocPickAgreement") };
    agreementId = sa.id;
    const patch: Database["public"]["Tables"]["service_agreements"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (contractType) patch.contract_type = contractType;
    if (signedOn) patch.signed_on = signedOn;
    if (signatories) patch.signatories = signatories;
    if (input.hasGps) patch.has_gps = true;
    const { error } = await supabase.from("service_agreements").update(patch).eq("id", sa.id);
    if (error) return { ok: false, error: t("saDocCouldNotSave", { detail: error.message }) };
  } else {
    const name = input.target.name.trim();
    if (!name) return { ok: false, error: t("saGiveName") };
    const unitId = input.target.unitId || null;
    if (unitId) {
      const { data: unit } = await supabase
        .from("organization_units")
        .select("id")
        .eq("id", unitId)
        .eq("organization_id", doc.organization_id)
        .maybeSingle();
      if (!unit) return { ok: false, error: t("saDocPickAgreement") };
    }
    const { data: sa, error } = await supabase
      .from("service_agreements")
      .insert({
        organization_id: doc.organization_id,
        organization_unit_id: unitId,
        name_en: name,
        name_da: name,
        status: "active",
        start_date: signedOn ?? input.startDate,
        has_gps: input.hasGps,
        contract_type: contractType,
        signed_on: signedOn,
        signatories,
      })
      .select("id")
      .single();
    if (error || !sa) {
      return { ok: false, error: t("saCouldNotCreate", { detail: error?.message ?? "" }) };
    }
    agreementId = sa.id;
  }

  const lines = await addAgreementLines(supabase, {
    agreementId,
    lines: bikeIds.map((bikeId) => ({ bikeId, startDate: input.startDate })),
    yearlyPrice,
    currency: "DKK",
    hasGps: input.hasGps,
    source: "document",
    documentId,
    actorId,
    moveBikeIds: move,
  });
  if (lines.error) return { ok: false, error: t("saDocCouldNotSave", { detail: lines.error }) };

  const { error: docErr } = await supabase
    .from("service_agreement_documents")
    .update({
      status: "confirmed",
      agreement_id: agreementId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (docErr) return { ok: false, error: t("saDocCouldNotSave", { detail: docErr.message }) };

  revalidatePath(`/organizations/${doc.organization_id}`);
  revalidatePath(`/service-agreements/${agreementId}`);
  revalidatePath(`/service-agreements/documents/${documentId}`);
  revalidatePath("/service-agreements");
  revalidatePath("/bikes");
  return {
    ok: true,
    agreementId,
    added: lines.added,
    moved: lines.moved,
    skipped: lines.skipped,
  };
}
