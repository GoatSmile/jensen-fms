"use server";

import { revalidatePath } from "next/cache";

import {
  createCategory,
  updateCategory,
  setCategoryActive,
} from "@/app/admin/categories/_actions/manage-categories";
import {
  createColor,
  updateColor,
  setColorActive,
} from "@/app/admin/colors/_actions/manage-colors";
import {
  createCoating,
  updateCoating,
  setCoatingActive,
} from "@/app/admin/colors/_actions/manage-coatings";
import {
  createCustomerSegment,
  updateCustomerSegment,
  setCustomerSegmentActive,
} from "@/app/admin/customer-segments/_actions/manage-customer-segments";
import {
  createFamily,
  updateFamily,
  setFamilyActive,
} from "@/app/admin/families/_actions/manage-families";
import {
  createHsCode,
  updateHsCode,
  setHsCodeActive,
} from "@/app/admin/hs-codes/_actions/manage-hs-codes";
import {
  createLocation,
  updateLocation,
  setLocationActive,
} from "@/app/admin/locations/_actions/manage-locations";
import type { VocabId } from "@/lib/admin/vocabularies";

export type VocabResult = { ok: true } | { ok: false; error: string };

/**
 * One entry point per operation, routed by vocabulary id.
 *
 * The row editor is a single client component, so without this it would have to
 * import seven action modules and branch at the call site. Routing here keeps
 * that branch on the server and gives the client one import.
 *
 * **These wrap the existing per-vocabulary actions unchanged.** Every
 * entity-specific rule stays where it already lives and is already proven — the
 * parent-cycle check in `updateCategory`, "the primary location cannot be
 * archived" in `setLocationActive`, the unique-slug and duplicate-code messages,
 * every localized error string. This module adds routing and one
 * `revalidatePath`, nothing else. If a rule needs changing, change it in the
 * owning action, not here.
 *
 * **Why revalidation lives here and not in the seven actions.** Each of them
 * already revalidates its own legacy route plus `/admin`; none knows about
 * `/admin/lists`. Adding the path in one place beats seven identical one-line
 * edits, and it keeps this page's cache concern out of modules that predate it.
 * The gap while both surfaces coexist is small and temporary: editing via a
 * legacy route won't refresh `/admin/lists`. Those routes redirect here in
 * commit 2, which closes it.
 */
const CREATE: Record<VocabId, (formData: FormData) => Promise<VocabResult>> = {
  categories: createCategory,
  colors: createColor,
  coatings: createCoating,
  segments: createCustomerSegment,
  families: createFamily,
  "hs-codes": createHsCode,
  locations: createLocation,
};

const UPDATE: Record<
  VocabId,
  (id: string, formData: FormData) => Promise<VocabResult>
> = {
  categories: updateCategory,
  colors: updateColor,
  coatings: updateCoating,
  segments: updateCustomerSegment,
  families: updateFamily,
  "hs-codes": updateHsCode,
  locations: updateLocation,
};

const SET_ACTIVE: Record<
  VocabId,
  (id: string, isActive: boolean) => Promise<VocabResult>
> = {
  categories: setCategoryActive,
  colors: setColorActive,
  coatings: setCoatingActive,
  segments: setCustomerSegmentActive,
  families: setFamilyActive,
  "hs-codes": setHsCodeActive,
  locations: setLocationActive,
};

/** Create when `id` is null, update otherwise. */
export async function saveVocabRow(
  vocab: VocabId,
  id: string | null,
  formData: FormData,
): Promise<VocabResult> {
  const result = id
    ? await UPDATE[vocab](id, formData)
    : await CREATE[vocab](formData);
  if (result.ok) revalidatePath("/admin/lists");
  return result;
}

export async function setVocabRowActive(
  vocab: VocabId,
  id: string,
  isActive: boolean,
): Promise<VocabResult> {
  const result = await SET_ACTIVE[vocab](id, isActive);
  if (result.ok) revalidatePath("/admin/lists");
  return result;
}
