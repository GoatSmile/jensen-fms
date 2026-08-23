"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readPersonId } from "@/lib/auth/read-session";
import { nullableString as nullable } from "@/lib/forms";
import { woAssignedEmail } from "@/lib/people/email-content";
import { notifyEvent } from "@/lib/people/notify";
import { loadActivePeople } from "@/lib/people/queries";
import { appOrigin } from "@/lib/qr";
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

  // P4: person-targeted ping (design: wo.assigned is NOT role-broadcast).
  // Self-assignment ("Assign to me") skips the email — you know already.
  if (personId) {
    const selfId = await readPersonId();
    if (personId !== selfId) {
      const { data: wo } = await supabase
        .from("work_orders")
        .select("wo_number, bike:bikes!bike_id(frame_number)")
        .eq("id", woId)
        .maybeSingle();
      if (wo) {
        await notifyEvent(supabase, {
          eventKey: "wo.assigned",
          entityId: woId,
          directPersonId: personId,
          buildContent: (lang) =>
            woAssignedEmail(lang, {
              woNumber: wo.wo_number,
              frameNumber: wo.bike?.frame_number ?? null,
              url: `${appOrigin()}/work/${woId}`,
            }),
        });
      }
    }
  }

  revalidatePath(`/maintenance/work-orders/${woId}`);
  revalidatePath("/maintenance/work-orders");
  revalidatePath("/work");
  return { ok: true };
}
