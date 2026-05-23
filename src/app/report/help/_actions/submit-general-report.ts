"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { nullableString as nullable } from "@/lib/forms";
import { createServiceClient } from "@/lib/supabase/service";

export type SubmitGeneralReportResult =
  | { ok: true; ticketNumber: string }
  | { ok: false; error: string };

const RATE_LIMIT_PER_HOUR = 5;

async function getRequestIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

/**
 * Public unidentified-bike report. Same anonymous posture as the
 * /b/<id> sticker form, but for the case where the customer can't (or
 * won't) identify the bike — they just want someone to call them back.
 *
 * Result is a maintenance_tickets row with bike_id = NULL, structured
 * contact info (name / email / phone / org), and the customer's
 * description preserved verbatim. Staff triage these from the tickets
 * list — link to a bike once identified, or close as info-only.
 *
 * Same rate limit (5/hour per IP) as the per-bike sticker path.
 */
export async function submitGeneralReport(
  formData: FormData,
): Promise<SubmitGeneralReportResult> {
  const name = nullable(formData.get("name"));
  const phone = nullable(formData.get("phone"));
  const email = nullable(formData.get("email"));
  const organization = nullable(formData.get("organization"));
  const description = nullable(formData.get("description"));

  if (!description) {
    return {
      ok: false,
      error: "Please describe what's wrong, even briefly.",
    };
  }
  if (description.length > 4000) {
    return {
      ok: false,
      error: "Description is too long (max 4000 characters).",
    };
  }
  if (!phone && !email) {
    return {
      ok: false,
      error: "Please leave a phone number or email so we can reach you.",
    };
  }
  if (!name) {
    return { ok: false, error: "Please tell us your name." };
  }

  const supabase = createServiceClient();
  const ip = await getRequestIp();

  // Rate-limit: 5 attempts per IP per hour. Shared ledger with the
  // per-bike sticker reports.
  const { count, error: rateErr } = await supabase
    .from("public_report_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (rateErr) {
    return {
      ok: false,
      error: `Could not check rate limit: ${rateErr.message}`,
    };
  }
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    await supabase
      .from("public_report_attempts")
      .insert({ ip, bike_id: null, ticket_id: null });
    return {
      ok: false,
      error: "Too many reports from this device. Try again in an hour.",
    };
  }

  // Allocate a ticket number.
  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "maintenance_ticket" },
  );
  if (numErr || !numberData) {
    return {
      ok: false,
      error: `Could not allocate ticket number: ${numErr?.message ?? "unknown"}`,
    };
  }

  // Pack the contact + org info into reported_by_text so the existing
  // tickets list — which already renders that column — surfaces it
  // without a schema change. Phone gets its own structured column for
  // callbacks. Description carries the verbatim message.
  const reporterParts: string[] = [name];
  if (organization) reporterParts.push(`(${organization})`);
  if (email) reporterParts.push(email);
  const reportedByText = reporterParts.join(" ");

  // Prefix description with the structured fields so staff see them at a
  // glance even before opening the ticket. Stays as plain text — no
  // markdown — because most ticket surfaces are <p> not Markdown.
  const descriptionParts: string[] = [];
  if (organization) {
    descriptionParts.push(`Organization (self-reported): ${organization}`);
  }
  descriptionParts.push(`Message: ${description}`);
  const fullDescription = descriptionParts.join("\n\n");

  const { data: ticket, error: ticketErr } = await supabase
    .from("maintenance_tickets")
    .insert({
      ticket_number: numberData,
      bike_id: null,
      reported_by_text: reportedByText,
      reported_by_phone: phone ?? null,
      source: "app",
      status: "open",
      priority: 3,
      description: fullDescription,
      reported_language: "da",
    })
    .select("id, ticket_number")
    .single();
  if (ticketErr || !ticket) {
    return {
      ok: false,
      error: `Could not create report: ${ticketErr?.message ?? "unknown"}`,
    };
  }

  await supabase
    .from("public_report_attempts")
    .insert({ ip, bike_id: null, ticket_id: ticket.id });

  revalidatePath("/maintenance/tickets");

  return { ok: true, ticketNumber: ticket.ticket_number };
}
