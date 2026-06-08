"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveServiceAgreementResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

type Parsed = {
  organization_id: string;
  organization_unit_id: string | null;
  name_en: string;
  name_da: string;
  status: "active" | "expired" | "cancelled";
  start_date: string;
  end_date: string | null;
  covers_parts: boolean;
  covers_labor: boolean;
  has_gps: boolean;
  monthly_fee: number | null;
  fee_currency: string;
  notes: string | null;
};

const bool = (fd: FormData, k: string) => fd.get(k) === "true";

function parse(
  fd: FormData,
): { ok: true; values: Parsed } | { ok: false; error: string; field?: string } {
  const organization_id = nullable(fd.get("organization_id"));
  if (!organization_id)
    return { ok: false, error: "Pick a customer.", field: "organization_id" };

  const name = nullable(fd.get("name"));
  if (!name)
    return { ok: false, error: "Give the agreement a name.", field: "name" };

  const start_date = nullable(fd.get("start_date"));
  if (!start_date)
    return { ok: false, error: "A start date is required.", field: "start_date" };

  const end_date = nullable(fd.get("end_date"));
  if (end_date && end_date < start_date)
    return {
      ok: false,
      error: "End date can't be before the start date.",
      field: "end_date",
    };

  const statusRaw = nullable(fd.get("status")) ?? "active";
  if (!["active", "expired", "cancelled"].includes(statusRaw))
    return { ok: false, error: "Invalid status.", field: "status" };

  let monthly_fee: number | null = null;
  const feeRaw = nullable(fd.get("monthly_fee"));
  if (feeRaw) {
    const n = Number(feeRaw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0)
      return {
        ok: false,
        error: "Monthly fee must be a non-negative number.",
        field: "monthly_fee",
      };
    monthly_fee = n;
  }

  return {
    ok: true,
    values: {
      organization_id,
      organization_unit_id: nullable(fd.get("organization_unit_id")),
      name_en: name,
      name_da: name,
      status: statusRaw as Parsed["status"],
      start_date,
      end_date,
      covers_parts: bool(fd, "covers_parts"),
      covers_labor: bool(fd, "covers_labor"),
      has_gps: bool(fd, "has_gps"),
      monthly_fee,
      fee_currency: nullable(fd.get("fee_currency")) ?? "DKK",
      notes: nullable(fd.get("notes")),
    },
  };
}

export async function createServiceAgreement(
  fd: FormData,
): Promise<SaveServiceAgreementResult> {
  const parsed = parse(fd);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_agreements")
    .insert(parsed.values)
    .select("id")
    .single();
  if (error || !data)
    return {
      ok: false,
      error: `Could not create agreement: ${error?.message ?? "unknown error"}`,
    };

  revalidatePath("/service-agreements");
  revalidatePath("/organizations/map");
  redirect(`/service-agreements/${data.id}`);
}

export async function updateServiceAgreement(
  id: string,
  fd: FormData,
): Promise<SaveServiceAgreementResult> {
  if (!id) return { ok: false, error: "Missing agreement id." };
  const parsed = parse(fd);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_agreements")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  revalidatePath("/service-agreements");
  revalidatePath(`/service-agreements/${id}`);
  revalidatePath("/organizations/map");
  redirect(`/service-agreements/${id}`);
}
