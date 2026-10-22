/**
 * The record the person has OPEN when they ask — so "this bike", "here" and
 * "move it" resolve without a question back (owner, 2026-10-22). The path
 * comes from the browser, so it is UNTRUSTED: only a page this person's role
 * may open is described (`routeAllows`, middleware's rule), only ids shaped
 * like ids are read, and what comes back is a label, never the record.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { routeAllows } from "@/lib/people/routes";

import type { PageContext } from "./agent";
import type { TargetKind } from "./answer";

const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

/** Route → kind, most specific first (the build workbench is about a BIKE). */
const ROUTES: { re: RegExp; kind: TargetKind }[] = [
  { re: new RegExp(`^/manufacturing-orders/${UUID}/bikes/${UUID}`, "i"), kind: "bike" },
  { re: new RegExp(`^/bikes/${UUID}`, "i"), kind: "bike" },
  { re: new RegExp(`^/organizations/${UUID}`, "i"), kind: "customer" },
  { re: new RegExp(`^/parts/${UUID}`, "i"), kind: "part" },
  { re: new RegExp(`^/maintenance/tickets/${UUID}`, "i"), kind: "ticket" },
  { re: new RegExp(`^/maintenance/work-orders/${UUID}`, "i"), kind: "work_order" },
  { re: new RegExp(`^/offers/${UUID}`, "i"), kind: "offer" },
  { re: new RegExp(`^/sales-orders/${UUID}`, "i"), kind: "sales_order" },
  { re: new RegExp(`^/manufacturing-orders/${UUID}`, "i"), kind: "manufacturing_order" },
  { re: new RegExp(`^/purchase-orders/${UUID}`, "i"), kind: "purchase_order" },
  { re: new RegExp(`^/paint-orders/${UUID}`, "i"), kind: "paint_order" },
  { re: new RegExp(`^/invoices/${UUID}`, "i"), kind: "invoice" },
  { re: new RegExp(`^/calls/${UUID}`, "i"), kind: "call" },
];

/** Where each kind lives and which column names it for a person. */
const LABELS: Partial<Record<TargetKind, { table: string; columns: string }>> = {
  bike: { table: "bikes", columns: "frame_number" },
  customer: { table: "organizations", columns: "legal_name, display_name_da, display_name_en" },
  part: { table: "parts", columns: "internal_sku, name_en" },
  ticket: { table: "maintenance_tickets", columns: "ticket_number" },
  work_order: { table: "work_orders", columns: "wo_number" },
  offer: { table: "offers", columns: "offer_number" },
  sales_order: { table: "sales_orders", columns: "sales_order_number" },
  manufacturing_order: { table: "manufacturing_orders", columns: "mo_number" },
  purchase_order: { table: "purchase_orders", columns: "po_number" },
  paint_order: { table: "service_orders", columns: "order_number" },
  invoice: { table: "invoices", columns: "invoice_number" },
  call: { table: "inbound_messages", columns: "kind, from_identity, received_at" },
};

export async function describePage(
  supabase: SupabaseClient,
  path: string | null | undefined,
  caps: readonly string[],
): Promise<PageContext | null> {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  const clean = path.split(/[?#]/)[0].slice(0, 300);
  if (!routeAllows(clean, caps)) return null;
  for (const { re, kind } of ROUTES) {
    const m = clean.match(re);
    if (!m) continue;
    // A call's page checks its LINE (calls_own sees only one's own), which a
    // route rule cannot — so only the office (`inbox`) gets calls described.
    if (kind === "call" && !caps.includes("inbox")) return null;
    const id = (m[2] ?? m[1]).toLowerCase();
    const spec = LABELS[kind];
    if (!spec) return null;
    const { data } = await supabase.from(spec.table).select(spec.columns).eq("id", id).maybeSingle();
    if (!data) return null;
    return { kind, id, label: labelOf(kind, data as unknown as Record<string, string | null>) };
  }
  return null;
}

function labelOf(kind: TargetKind, r: Record<string, string | null>): string {
  switch (kind) {
    case "customer":
      return r.display_name_da ?? r.display_name_en ?? r.legal_name ?? "customer";
    case "part":
      return [r.internal_sku, r.name_en].filter(Boolean).join(" ");
    case "call":
      return `${r.kind === "note" ? "note" : "call"} from ${r.from_identity ?? "unknown"} at ${r.received_at ?? ""}`.trim();
    default:
      return Object.values(r).find((v) => typeof v === "string" && v) ?? kind;
  }
}
