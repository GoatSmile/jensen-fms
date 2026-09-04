"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { isOfferEditable, type OfferStatus } from "@/lib/offers/status";

type Translator = Awaited<ReturnType<typeof getTranslations>>;

export type SaveOfferResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

type ParsedOfferFields = {
  organization_id: string;
  organization_unit_id: string | null;
  contact_id: string | null;
  language: string;
  currency: string;
  expiry_date: string | null;
  notes: string | null;
};

function parseFields(
  formData: FormData,
  t: Translator,
):
  | { ok: true; values: ParsedOfferFields }
  | { ok: false; error: string; field?: string } {
  const organization_id = nullable(formData.get("organization_id"));
  if (!organization_id) {
    return { ok: false, error: t("offerPickCustomer"), field: "organization_id" };
  }

  // The document's language is a fact about the RECIPIENT, defaulted from
  // organizations.preferred_language by the form — never the UI locale.
  const language = (nullable(formData.get("language")) ?? "da").toLowerCase();
  if (language !== "da" && language !== "en") {
    return { ok: false, error: t("languageDaEn"), field: "language" };
  }

  const currency = (nullable(formData.get("currency")) ?? "DKK").toUpperCase();
  if (currency.length !== 3) {
    return { ok: false, error: t("pickCurrency"), field: "currency" };
  }

  return {
    ok: true,
    values: {
      organization_id,
      organization_unit_id: nullable(formData.get("organization_unit_id")),
      contact_id: nullable(formData.get("contact_id")),
      language,
      currency,
      expiry_date: nullable(formData.get("expiry_date")),
      notes: nullable(formData.get("notes")),
    },
  };
}

/**
 * Create an offer in draft. The number comes from
 * `next_document_number('offer')` → `OFF-YYYY-NNNN`, in lockstep with every
 * other document series. Lines come afterwards via manage-offer-lines.
 *
 * `issued_date` and `expiry_date` are NOT stamped here — an offer is issued
 * when it is sent, not when it is typed. A date entered on the form is kept as
 * the intended expiry and honoured at send.
 */
export async function createOffer(formData: FormData): Promise<SaveOfferResult> {
  const t = await getTranslations("errors");
  const parsed = parseFields(formData, t);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();

  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "offer" },
  );
  if (numErr || !numberData) {
    return {
      ok: false,
      error: t("offerCouldNotAllocateNumber", {
        detail: numErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { data, error } = await supabase
    .from("offers")
    .insert({
      offer_number: numberData,
      status: "draft",
      ...parsed.values,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: t("offerCouldNotCreate", {
        detail: error?.message ?? t("unknownError"),
      }),
    };
  }

  revalidatePath("/offers");
  redirect(`/offers/${data.id}`);
}

/**
 * Update the offer header. Draft only — past that the customer is holding the
 * document, and the way to change it is to reopen it for revision.
 */
export async function updateOffer(
  offerId: string,
  formData: FormData,
): Promise<SaveOfferResult> {
  const t = await getTranslations("errors");
  if (!offerId) return { ok: false, error: t("missingOfferId") };
  const parsed = parseFields(formData, t);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("offers")
    .select("id, status")
    .eq("id", offerId)
    .maybeSingle();
  if (!existing) return { ok: false, error: t("offerNotFound") };

  if (!isOfferEditable(existing.status as OfferStatus)) {
    return {
      ok: false,
      error: t("offerLocked", { status: existing.status }),
    };
  }

  const { error } = await supabase
    .from("offers")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", offerId);
  if (error) {
    return {
      ok: false,
      error: t("offerCouldNotUpdate", { detail: error.message }),
    };
  }

  revalidatePath(`/offers/${offerId}`);
  revalidatePath("/offers");
  redirect(`/offers/${offerId}`);
}
