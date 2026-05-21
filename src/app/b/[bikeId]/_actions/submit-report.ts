"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { nullableString as nullable } from "@/lib/forms";
import { createServiceClient } from "@/lib/supabase/service";

export type SubmitReportResult =
  | { ok: true; ticketNumber: string; ticketId: string }
  | { ok: false; error: string };

const RATE_LIMIT_PER_HOUR = 5;
const BUCKET = "bike-images";

async function getRequestIp(): Promise<string> {
  // Behind Vercel's edge / a proxy the originating IP is in
  // x-forwarded-for. The header may be a comma-separated list; take the
  // first entry (the client). Fall back to 'unknown' so the rate-limit
  // still inserts a row (just under a sentinel key).
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

/**
 * Public customer report handler. Called from the form on /b/<bike-id>.
 * No auth — anyone with a sticker URL can submit.
 *
 * Flow:
 *   1. Validate the bike exists.
 *   2. Rate-limit by client IP (5/hour). Inserts a row regardless of
 *      success so the next attempt counter is correct.
 *   3. Create a maintenance_tickets row with source='app', priority 3,
 *      reported_by_text combining name + email, description and notes
 *      populated from the form.
 *   4. If a photo was attached, resize-on-client + upload to the
 *      bike-images bucket under <bike-id>/ticket/<ticket-id>/<uuid>.webp,
 *      then INSERT an attachments row linking the file to the ticket.
 *
 * Photos are uploaded by the client (resize happens client-side before
 * the FormData arrives) — this server action only stages the file into
 * Storage and registers the attachment. The bucket has anon insert.
 */
export async function submitPublicTicketReport(
  bikeId: string,
  formData: FormData,
): Promise<SubmitReportResult> {
  if (!bikeId) return { ok: false, error: "Missing bike id." };

  const description = nullable(formData.get("description"));
  if (!description) {
    return { ok: false, error: "Please describe what's wrong." };
  }
  if (description.length > 4000) {
    return {
      ok: false,
      error: "Description is too long (max 4000 characters).",
    };
  }

  const name = nullable(formData.get("name"));
  const email = nullable(formData.get("email"));
  const reportedByText =
    name && email
      ? `${name} (${email})`
      : (name ?? email ?? null);

  const supabase = createServiceClient();
  const ip = await getRequestIp();

  // Validate the bike exists.
  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, frame_number")
    .eq("id", bikeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (bikeErr || !bike) {
    return {
      ok: false,
      error: "We couldn't find that bike. Please contact Jensen Production.",
    };
  }

  // Rate-limit: 5 attempts per IP per hour.
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
    // Log the blocked attempt for visibility (no ticket_id since none
    // was created).
    await supabase
      .from("public_report_attempts")
      .insert({ ip, bike_id: bikeId, ticket_id: null });
    return {
      ok: false,
      error: "Too many reports from this device. Try again in an hour.",
    };
  }

  // Allocate a ticket number + insert the ticket.
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

  const { data: ticket, error: ticketErr } = await supabase
    .from("maintenance_tickets")
    .insert({
      ticket_number: numberData,
      bike_id: bikeId,
      reported_by_text: reportedByText,
      source: "app",
      status: "open",
      priority: 3,
      description,
      reported_language: "da",
    })
    .select("id, ticket_number")
    .single();
  if (ticketErr || !ticket) {
    return {
      ok: false,
      error: `Could not create ticket: ${ticketErr?.message ?? "unknown"}`,
    };
  }

  // Record the attempt with the resulting ticket id.
  await supabase
    .from("public_report_attempts")
    .insert({ ip, bike_id: bikeId, ticket_id: ticket.id });

  // Optional photo. Already resized client-side to ~1600px WebP.
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) {
      // We've already created the ticket; better to keep it and skip the
      // attachment than fail the whole flow. The user can email the
      // photo if needed.
      return {
        ok: true,
        ticketNumber: ticket.ticket_number,
        ticketId: ticket.id,
      };
    }
    const objectPath = `${bikeId}/ticket/${ticket.id}/${crypto.randomUUID()}.webp`;
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

    // Insert the attachments row first (row-then-file pattern, same as
    // parts photos — see src/app/parts/[id]/_actions/upload-image.ts).
    const { data: att, error: attErr } = await supabase
      .from("attachments")
      .insert({
        entity_type: "maintenance_ticket",
        entity_id: ticket.id,
        file_url: publicUrl,
        file_name: file.name || objectPath,
        file_size_bytes: file.size,
        mime_type: file.type || "image/webp",
        purpose: "gallery",
      })
      .select("id")
      .single();
    if (!attErr && att) {
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, file, {
          contentType: "image/webp",
          upsert: false,
        });
      if (upErr) {
        // Clean up the placeholder row.
        await supabase.from("attachments").delete().eq("id", att.id);
      }
    }
  }

  revalidatePath("/maintenance/tickets");
  revalidatePath(`/bikes/${bikeId}`);

  return {
    ok: true,
    ticketNumber: ticket.ticket_number,
    ticketId: ticket.id,
  };
}
