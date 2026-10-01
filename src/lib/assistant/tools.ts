/**
 * The assistant's READ tools — what it can look up before it answers. Each
 * tool names the capabilities that may use it (any one suffices), and the
 * agent is only ever OFFERED the tools the asking person's role allows, so a
 * technician's assistant cannot read what a technician's screens cannot show
 * (Munr's rule, and step 3 of 2026-10-01: rights per action, here per read).
 * Money follows the screens too: amounts are left out of every result unless
 * the person holds `costs`.
 *
 * Every id a tool returns is recorded in `seen` with its kind, because the
 * agent may only open — or act on — a record its own lookups produced in the
 * same run (Munr's `mayTouch`).
 *
 * The drafting lookups (customers, templates, colours, parts) stay in
 * src/lib/inbound/command/resolvers.ts, shared with the call planner.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calendarAdapter } from "@/lib/calendar/client";
import { calendarReady, loadCalendarSettings } from "@/lib/calendar/settings";
import { danishMidnight, danishTime, shiftDayKey } from "@/lib/calls/days";
import { ilikeEscape } from "@/lib/supabase/ilike";
import { searchWorkBikeIds } from "@/lib/work/search";

import type { TargetKind } from "./answer";

export type ToolContext = {
  supabase: SupabaseClient;
  caps: readonly string[];
  canSeeCosts: boolean;
  /** id → kind, for every record a lookup returned in this run. */
  seen: Map<string, TargetKind>;
};

type ToolDef = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

type AssistantTool = {
  def: ToolDef;
  /** Any one of these lets a person's assistant use the tool. */
  caps: readonly string[];
  run: (ctx: ToolContext, input: Record<string, unknown>) => Promise<unknown>;
};

const LIMIT = 8;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function orgName(o: { legal_name?: string | null; display_name_da?: string | null; display_name_en?: string | null } | null) {
  return o ? (o.display_name_da ?? o.display_name_en ?? o.legal_name ?? null) : null;
}

/* --------------------------------------------------------------- bikes */

const findBike: AssistantTool = {
  caps: ["bikes", "work"],
  def: {
    name: "find_bike",
    description:
      "Find bikes by recognition code (the code on the label, e.g. BKTM01 — spoken forms like 'bktm 1' work), frame number, any identifier, or the owner's name. 'Bike 55' usually means a recognition code or number ending in 55. Returns up to 8 bikes and how many matched in total.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What the person called the bike." } },
      required: ["query"],
    },
  },
  async run(ctx, input) {
    const q = str(input.query);
    if (!q) return { error: "empty query" };
    const { ids, error } = await searchWorkBikeIds(ctx.supabase as never, q);
    if (error) return { error };
    const all = [...ids];
    if (all.length === 0) return { total: 0, bikes: [] };
    const sample = all.slice(0, 200);
    const [{ data: bikes }, { data: codes }] = await Promise.all([
      ctx.supabase
        .from("bikes")
        .select(
          "id, frame_number, status, bike_template:bike_templates(family:bike_families(name), frame_size), owner:organizations!owner_organization_id(legal_name, display_name_da, display_name_en)",
        )
        .in("id", sample)
        .is("deleted_at", null),
      ctx.supabase
        .from("bike_identifiers")
        .select("bike_id, identifier_value, type:bike_identifier_types!inner(slug)")
        .eq("is_active", true)
        .eq("type.slug", "fleet_number")
        .in("bike_id", sample),
    ]);
    const code = new Map((codes ?? []).map((c) => [c.bike_id as string, c.identifier_value as string]));
    const needle = q.toLowerCase().replace(/\s+/g, "");
    // Exact hits first, then codes/frames that END with what was said ("55").
    const rank = (b: { id: string; frame_number: string }) => {
      const c = (code.get(b.id) ?? "").toLowerCase();
      const f = b.frame_number.toLowerCase();
      if (c === needle || f === needle) return 0;
      if (c.endsWith(needle) || f.endsWith(needle)) return 1;
      return 2;
    };
    type Row = { id: string; frame_number: string; status: string; bike_template: unknown; owner: unknown };
    // Count only bikes that exist: an identifier can outlive its deleted bike.
    const live = (bikes ?? []) as Row[];
    const rows = [...live].sort((a, b) => rank(a) - rank(b)).slice(0, LIMIT);
    for (const b of rows) ctx.seen.set(b.id, "bike");
    return {
      total: all.length > sample.length ? `${live.length}+` : live.length,
      bikes: rows.map((b) => {
        const tpl = b.bike_template as { family?: { name?: string } | null; frame_size?: string | null } | null;
        return {
          id: b.id,
          recognitionCode: code.get(b.id) ?? null,
          frameNumber: b.frame_number,
          status: b.status,
          model: tpl ? [tpl.family?.name, tpl.frame_size].filter(Boolean).join(" ") || null : null,
          owner: orgName(b.owner as never),
        };
      }),
    };
  },
};

/* --------------------------------------------------------------- parts */

const findPart: AssistantTool = {
  caps: ["parts"],
  def: {
    name: "find_part",
    description:
      "Find catalog parts by name or SKU, with how many are in stock. Up to 8. Part names are mostly DANISH (batteri, lader, stel, forgaffel, kurv, dæk, slange, bremse) — search with the Danish word or a short stem ('batter', '36v'). Every word must appear, in any order. If nothing matches, try again with fewer or shorter words before saying it isn't there.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Words from the part's name or its SKU." } },
      required: ["query"],
    },
  },
  async run(ctx, input) {
    const q = str(input.query);
    if (!q) return { error: "empty query" };
    // Each word must appear somewhere (name or SKU), in any order — "36v
    // batter" finds "Batteri 36v 14 Ah". Chained .or() filters are ANDed.
    const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
    let req = ctx.supabase
      .from("parts")
      .select("id, internal_sku, name_en, name_da")
      .is("deleted_at", null);
    for (const w of words) {
      const like = `%${ilikeEscape(w)}%`;
      req = req.or(`name_en.ilike.${like},name_da.ilike.${like},internal_sku.ilike.${like}`);
    }
    const { data: parts, error } = await req.limit(LIMIT);
    if (error) return { error: error.message };
    const ids = (parts ?? []).map((p) => p.id);
    if (ids.length === 0) return { parts: [] };
    const [{ data: stock }, costs] = await Promise.all([
      ctx.supabase.from("v_current_stock").select("part_id, quantity_on_hand").in("part_id", ids),
      ctx.canSeeCosts
        ? ctx.supabase.from("v_part_last_cost").select("part_id, last_cost_dkk, last_cost_basis").in("part_id", ids)
        : Promise.resolve({ data: [] as { part_id: string; last_cost_dkk: number | null; last_cost_basis: string | null }[] }),
    ]);
    const onHand = new Map<string, number>();
    for (const s of stock ?? []) onHand.set(s.part_id, (onHand.get(s.part_id) ?? 0) + Number(s.quantity_on_hand ?? 0));
    const cost = new Map((costs.data ?? []).map((c) => [c.part_id, c]));
    for (const p of parts ?? []) ctx.seen.set(p.id, "part");
    return {
      parts: (parts ?? []).map((p) => ({
        id: p.id,
        sku: p.internal_sku,
        name: p.name_da || p.name_en,
        inStock: onHand.get(p.id) ?? 0,
        // Money only for those who may see it — the screens' rule.
        ...(ctx.canSeeCosts && cost.get(p.id)
          ? { lastCostDkk: cost.get(p.id)?.last_cost_dkk, costBasis: cost.get(p.id)?.last_cost_basis }
          : {}),
      })),
    };
  },
};

/* ------------------------------------------------------------ calendar */

const calendarEntries: AssistantTool = {
  caps: ["maintenance", "work"],
  def: {
    name: "calendar_entries",
    description:
      "Read the service calendar (visits, reminders, and anything added in Google) between two dates. Defaults: from now, 30 days ahead. For 'my next appointment' use the defaults and take the first.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date (YYYY-MM-DD), optional." },
        to: { type: "string", description: "ISO date (YYYY-MM-DD), optional." },
      },
    },
  },
  async run(ctx, input) {
    const settings = await loadCalendarSettings(ctx.supabase);
    const adapter = calendarAdapter(settings.provider);
    if (!calendarReady(settings) || !adapter) return { error: "no calendar is set up" };
    const fromIso = str(input.from);
    const toIso = str(input.to);
    // Danish days, whatever the season — never a hard-coded offset.
    const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    const from = isDay(fromIso) ? danishMidnight(fromIso) : new Date();
    const to = isDay(toIso) ? danishMidnight(shiftDayKey(toIso, 1)) : new Date(from.getTime() + 30 * 86_400_000);
    const r = await adapter.listEvents(settings.calendarId, { from, to });
    if (!r.ok) return { error: r.error };
    ctx.seen.set("calendar", "calendar");
    return {
      entries: r.value.slice(0, 15).map((e) => ({
        title: e.title,
        kind: e.kind ?? "other",
        date: e.allDay ? e.start : e.start.slice(0, 10),
        time: e.allDay ? "all day" : `${danishTime(e.start)}–${danishTime(e.end)}`,
        location: e.location,
      })),
    };
  },
};

/* ------------------------------------------------------------- tickets */

const OPEN_TICKET = ["open", "in_diagnosis", "awaiting_parts", "in_repair"];

const openTickets: AssistantTool = {
  caps: ["maintenance"],
  def: {
    name: "open_tickets",
    description: "List repair tickets that are still open (newest first), optionally only those mentioning a word (customer, problem, frame).",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Optional filter word." } },
    },
  },
  async run(ctx, input) {
    const q = str(input.query);
    let req = ctx.supabase
      .from("maintenance_tickets")
      .select("id, ticket_number, status, description, created_at, reported_by_text, bike:bikes(frame_number)")
      .in("status", OPEN_TICKET)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (q) {
      const like = `%${ilikeEscape(q)}%`;
      req = req.or(`description.ilike.${like},ticket_number.ilike.${like},reported_by_text.ilike.${like}`);
    }
    const { data, error } = await req;
    if (error) return { error: error.message };
    for (const t of data ?? []) ctx.seen.set(t.id, "ticket");
    return {
      tickets: (data ?? []).map((t) => ({
        id: t.id,
        number: t.ticket_number,
        status: t.status,
        problem: (t.description ?? "").slice(0, 120),
        bikeFrame: (t.bike as { frame_number?: string } | null)?.frame_number ?? null,
        reportedBy: t.reported_by_text,
        opened: t.created_at.slice(0, 10),
      })),
    };
  },
};

/* ----------------------------------------------------------- documents */

type DocSpec = {
  kind: TargetKind;
  table: string;
  column: string;
  cap: string;
  /** Who the document is with, when it has an organisation. */
  party: "organization" | "supplier" | null;
  money: string | null;
};

/** Document number prefix → where it lives. Gapless series, so the prefix decides. */
const DOCS: Record<string, DocSpec> = {
  "OFF-": { kind: "offer", table: "offers", column: "offer_number", cap: "so", party: "organization", money: "total_amount" },
  "SO-": { kind: "sales_order", table: "sales_orders", column: "sales_order_number", cap: "so", party: "organization", money: "total_amount" },
  "MO-": { kind: "manufacturing_order", table: "manufacturing_orders", column: "mo_number", cap: "mo", party: null, money: null },
  "PO-": { kind: "purchase_order", table: "purchase_orders", column: "po_number", cap: "po", party: "supplier", money: null },
  "PNT-": { kind: "paint_order", table: "service_orders", column: "order_number", cap: "paint", party: "supplier", money: null },
  "TKT-": { kind: "ticket", table: "maintenance_tickets", column: "ticket_number", cap: "maintenance", party: null, money: null },
  "WO-": { kind: "work_order", table: "work_orders", column: "wo_number", cap: "maintenance", party: null, money: null },
  "INV-": { kind: "invoice", table: "invoices", column: "invoice_number", cap: "invoices", party: "organization", money: "total_amount" },
};

const findDocument: AssistantTool = {
  caps: ["so", "mo", "po", "paint", "maintenance", "invoices"],
  def: {
    name: "find_document",
    description:
      "Look up a document by its number — offer OFF-…, sales order SO-…, manufacturing order MO-…, purchase order PO-…, paint order PNT-…, ticket TKT-…, work order WO-…, invoice INV-…. 'SO 12' means SO-<this year>-0012. Returns its status and who it is with.",
    input_schema: {
      type: "object",
      properties: { number: { type: "string", description: "The number as said, e.g. 'SO-2026-0012' or 'offer 3'." } },
      required: ["number"],
    },
  },
  async run(ctx, input) {
    const raw = str(input.number).toUpperCase().replace(/\s+/g, "-");
    const prefix = Object.keys(DOCS).find((p) => raw.startsWith(p) || raw.startsWith(p.slice(0, -1)));
    if (!prefix) return { error: "unknown number format" };
    const spec = DOCS[prefix];
    if (!ctx.caps.includes(spec.cap)) return { error: "not allowed for this person" };
    // "SO-12" → SO-<year>-0012; a full number passes through.
    const rest = raw.replace(new RegExp(`^${prefix.slice(0, -1)}-?`), "");
    const year = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen", year: "numeric" }).format(new Date());
    const num = /^\d{4}-\d{1,4}$/.test(rest)
      ? `${prefix}${rest.slice(0, 5)}${rest.slice(5).padStart(4, "0")}`
      : /^\d{1,4}$/.test(rest)
        ? `${prefix}${year}-${rest.padStart(4, "0")}`
        : `${prefix}${rest}`;
    const partySelect =
      spec.party === "organization"
        ? ", party:organizations!organization_id(legal_name, display_name_da, display_name_en)"
        : spec.party === "supplier"
          ? ", party:suppliers!supplier_id(name)"
          : "";
    const moneySelect = spec.money && ctx.canSeeCosts ? `, ${spec.money}, currency` : "";
    const { data, error } = await ctx.supabase
      .from(spec.table)
      .select(`id, ${spec.column}, status${partySelect}${moneySelect}`)
      .eq(spec.column, num)
      .limit(1);
    if (error) return { error: error.message };
    const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
    if (!row) return { found: false, searched: num };
    ctx.seen.set(row.id as string, spec.kind);
    const party = row.party as Record<string, string | null> | null | undefined;
    return {
      found: true,
      kind: spec.kind,
      id: row.id,
      number: row[spec.column],
      status: row.status,
      with: party ? (party.name ?? orgName(party)) : null,
      ...(moneySelect ? { total: row[spec.money as string], currency: row.currency } : {}),
    };
  },
};

export const ASSISTANT_TOOLS: AssistantTool[] = [findBike, findPart, calendarEntries, openTickets, findDocument];

/** The read tools THIS person's assistant gets. */
export function toolsFor(caps: readonly string[]): AssistantTool[] {
  return ASSISTANT_TOOLS.filter((t) => t.caps.some((c) => caps.includes(c)));
}
