"use server";

import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidateInbound } from "@/lib/calls/revalidate";
import { canActOnInbound } from "@/lib/calls/access";
import { createTicketForCall, type CreateTicketResult } from "@/lib/calls/ticket";

/**
 * Shadow-mode ticketing (Slice E): a reviewer turns a matched call into a
 * draft maintenance ticket. The work is `createTicketForCall`, shared with the
 * *draft ticket* suggestion.
 */
export async function createTicketFromInbound(
  messageId: string,
): Promise<CreateTicketResult> {
  const t = await getTranslations("errors");
  if (!(await canActOnInbound(messageId))) {
    return { ok: false, error: t("callNoAccess") };
  }
  const r = await createTicketForCall(createServiceClient(), messageId, t);
  if (r.ok) revalidateInbound(messageId);
  return r;
}
