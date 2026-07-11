"use server";

import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  loadMonthDetail,
  type MonthDetail,
  type MonthDetailKind,
} from "@/lib/dashboard/month-detail";

const KINDS: MonthDetailKind[] = ["sold", "serviced", "invoiced", "purchasing"];

/** Fetches the records behind one month's bar on a dashboard trend chart. */
export async function loadMonthDetailAction(
  kind: MonthDetailKind,
  monthStart: string,
): Promise<{ ok: true; detail: MonthDetail } | { ok: false; error: string }> {
  const t = await getTranslations("dashboard.monthDetail");
  if (!KINDS.includes(kind) || !/^\d{4}-\d{2}-01$/.test(monthStart)) {
    return { ok: false, error: t("invalidSelection") };
  }
  try {
    const supabase = await createClient();
    const detail = await loadMonthDetail(supabase, kind, monthStart);
    return { ok: true, detail };
  } catch {
    return { ok: false, error: t("loadError") };
  }
}
