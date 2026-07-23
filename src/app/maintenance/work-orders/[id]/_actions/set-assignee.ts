"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { loadActivePeople } from "@/lib/people/queries";
import { createClient } from "@/lib/supabase/server";

export type AssigneeResult = { ok: true } | { ok: false; error: string };

/**
 * Set/clear a work order's assignee (people & roles P3). Any pickable
 * person can be assigned — assignment is the WORK concept, independent of
 * which roles the person holds.
 */
export async function setWorkOrderAssignee(
  woId: string,
  formData: FormData,
): Promise<AssigneeResult> {
  const t = await getTranslations("errors");
  if (!woId) return { ok: false, error: t("missingId") };

  const personId = nullable(formData.get("person_id")) || null;
  const supabase = await createClient();

  if (personId) {
    const pickable = await loadActivePeople(supabase);
    if (!pickable.some((p) => p.id === personId)) {
      return { ok: false, error: t("woAssigneeInvalid") };
    }
  }

  const { error } = await supabase
    .from("work_orders")
    .update({ assigned_to: personId })
    .eq("id", woId);
  if (error) {
    return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  }

  revalidatePath(`/maintenance/work-orders/${woId}`);
  revalidatePath("/maintenance/work-orders");
  revalidatePath("/work");
  return { ok: true };
}
