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

import { loadBikeCoverage } from "@/lib/agreements/coverage";
import { isFrameProvisional, loadBikeIdentifierContext } from "@/lib/bikes/identifier-context";
import { calendarAdapter } from "@/lib/calendar/client";
import { calendarReady, loadCalendarSettings } from "@/lib/calendar/settings";
import type { CallsScope } from "@/lib/calls/access";
import { danishDayKey, danishMidnight, danishTime, shiftDayKey } from "@/lib/calls/days";
import { loadCallsPage } from "@/lib/calls/load";
import { loadNotesBoard } from "@/lib/inbox/notes";
import { loadPaintedDemand, loadPaintedStockLookup } from "@/lib/parts/painted-variants";
import { loadPaintStates } from "@/lib/services/at-supplier";
import { AT_SUPPLIER_STATUSES } from "@/lib/services/status";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ilikeEscape } from "@/lib/supabase/ilike";
import { searchWorkBikeIds } from "@/lib/work/search";

import { bikeListId, type BikeListFilter, type TargetKind } from "./answer";

export type ToolContext = {
  supabase: SupabaseClient;
  caps: readonly string[];
  canSeeCosts: boolean;
  /** Who is asking — the inbox is scoped to them unless they hold `inbox`. */
  personId: string | null;
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
      "Find bikes by recognition code (the code on the label, e.g. BKTM01 — spoken forms like 'bktm 1' work), frame number, any identifier, or the owner's name. 'Bike 55' usually means a recognition code or number ending in 55. Returns up to 8 bikes and how many matched in total. When exactly ONE bike matches, `details` adds its template and family, manufacturing and sales order numbers, paint state, service agreement, identifiers registered, last work order, ticket and status change.",
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
          "id, frame_number, status, color:colors(name_en, name_da, ral_code), bike_template:bike_templates(family:bike_families(name), frame_size), owner:organizations!owner_organization_id(legal_name, display_name_da, display_name_en)",
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
    type Row = { id: string; frame_number: string; status: string; color: unknown; bike_template: unknown; owner: unknown };
    // Count only bikes that exist: an identifier can outlive its deleted bike.
    const live = (bikes ?? []) as Row[];
    const rows = [...live].sort((a, b) => rank(a) - rank(b)).slice(0, LIMIT);
    for (const b of rows) ctx.seen.set(b.id, "bike");
    return {
      total: all.length > sample.length ? `${live.length}+` : live.length,
      // ONE bike: the whole picture, so "which MO is it on?" needs no second tool.
      ...(rows.length === 1 ? { details: await bikeDetails(ctx, rows[0].id) } : {}),
      bikes: rows.map((b) => {
        const tpl = b.bike_template as { family?: { name?: string } | null; frame_size?: string | null } | null;
        return {
          id: b.id,
          recognitionCode: code.get(b.id) ?? null,
          frameNumber: b.frame_number,
          status: b.status,
          model: tpl ? [tpl.family?.name, tpl.frame_size].filter(Boolean).join(" ") || null : null,
          colour: colourOf(b.color as never),
          owner: orgName(b.owner as never),
        };
      }),
    };
  },
};

/**
 * Everything the bike page would say about ONE bike, without money: its
 * template and family, the MO and SO it is built under, whether it is at the
 * painter or painted, the agreement covering it, its identifiers (the
 * page's own N / M rule), the last work order, ticket and status change.
 * Work orders and tickets follow the screens: `work`/`maintenance` see work
 * orders, only `maintenance` sees tickets.
 */
async function bikeDetails(ctx: ToolContext, bikeId: string) {
  const s = ctx.supabase;
  const { data: b } = await s
    .from("bikes")
    .select(
      `id, status, bike_type_id, manufacturing_order_id, frame_number_confirmed, built_at,
       template:bike_templates!template_id(name_en, name_da, family:bike_families(name)),
       mo:manufacturing_orders!manufacturing_order_id(id, mo_number, status,
         sales_order:sales_orders!sales_order_id(id, sales_order_number, status))`,
    )
    .eq("id", bikeId)
    .maybeSingle();
  if (!b) return null;
  const seesWork = ctx.caps.includes("work") || ctx.caps.includes("maintenance");
  const seesTickets = ctx.caps.includes("maintenance");
  const [paint, coverage, ids, wo, ticket, change] = await Promise.all([
    loadPaintStates(s as never),
    loadBikeCoverage(s as never, [bikeId]).catch(() => new Map()),
    b.bike_type_id
      ? loadBikeIdentifierContext(
          s as never,
          bikeId,
          b.bike_type_id,
          isFrameProvisional(b.status, b.frame_number_confirmed),
          b.manufacturing_order_id,
        )
      : null,
    seesWork
      ? s.from("work_orders").select("id, wo_number, status, created_at, completed_at, work_performed").eq("bike_id", bikeId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : null,
    seesTickets
      ? s.from("maintenance_tickets").select("id, ticket_number, status, description, created_at").eq("bike_id", bikeId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : null,
    s.from("bike_state_log").select("from_status, to_status, occurred_at").eq("bike_id", bikeId).order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const tpl = one(b.template) as { name_en?: string; name_da?: string | null; family?: unknown } | null;
  const mo = one(b.mo) as { id: string; mo_number: string; status: string; sales_order?: unknown } | null;
  const so = one(mo?.sales_order) as { id: string; sales_order_number: string; status: string } | null;
  if (mo) ctx.seen.set(mo.id, "manufacturing_order");
  if (so) ctx.seen.set(so.id, "sales_order");
  const agreement = coverage.get(bikeId);
  const lastWo = wo?.data ?? null;
  const lastTicket = ticket?.data ?? null;
  if (lastWo) ctx.seen.set(lastWo.id, "work_order");
  if (lastTicket) ctx.seen.set(lastTicket.id, "ticket");
  return {
    template: tpl ? (tpl.name_da ?? tpl.name_en ?? null) : null,
    family: (one(tpl?.family) as { name?: string } | null)?.name ?? null,
    builtAt: b.built_at,
    manufacturingOrder: mo ? { id: mo.id, number: mo.mo_number, status: mo.status } : null,
    salesOrder: so ? { id: so.id, number: so.sales_order_number, status: so.status } : null,
    paint: paint.atPainter.has(bikeId) ? "at the painter" : paint.painted.has(bikeId) ? "painted, back from the painter" : null,
    serviceAgreement: agreement
      ? { name: agreement.name_da ?? agreement.name_en, since: agreement.line_start_date, ends: agreement.end_date }
      : null,
    identifiers: ids
      ? {
          registered: `${ids.requiredRegisteredCount} of ${ids.requiredCount} required`,
          values: ids.rows.map((r) => `${r.typeName}: ${r.value}`),
        }
      : null,
    lastWorkOrder: lastWo
      ? { id: lastWo.id, number: lastWo.wo_number, status: lastWo.status, opened: lastWo.created_at, completed: lastWo.completed_at, work: (lastWo.work_performed ?? "").slice(0, 300) || null }
      : null,
    lastTicket: lastTicket
      ? { id: lastTicket.id, number: lastTicket.ticket_number, status: lastTicket.status, opened: lastTicket.created_at, problem: (lastTicket.description ?? "").slice(0, 300) || null }
      : null,
    lastStatusChange: change.data ? { from: change.data.from_status, to: change.data.to_status, at: change.data.occurred_at } : null,
  };
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v);

function colourOf(c: { name_en?: string | null; name_da?: string | null; ral_code?: string | null } | null) {
  if (!c) return null;
  const name = [c.name_da, c.name_en].filter(Boolean).filter((n, i, a) => a.indexOf(n) === i).join(" / ");
  return c.ral_code ? `${name} (RAL ${c.ral_code})` : name || null;
}

/* --------------------------------------------------------------- inbox */

/**
 * The Inbox (DECISIONS 2026-10-08) — notes and calls, read through the SAME
 * loaders the /inbox page uses, so the assistant sees exactly what the person
 * would see there: the same scope (`inbox` = everyone's, `calls_own` = their
 * own), the same to-do / check / done grouping. The owner's rule
 * (2026-10-21): the inbox is the most important place to look.
 */
const inbox: AssistantTool = {
  caps: ["inbox", "calls_own"],
  def: {
    name: "inbox",
    description:
      "Read the Inbox: spoken NOTES (to-dos people said to the app, per person) and CALLS (newest first, each with its group: todo, check, done or quiet, a one-line summary, who called and which customer). The most important place to look — use it for 'what's new', 'the latest call', 'who called', 'what is waiting', 'my notes', 'what did X say'. Optional `query` filters on words (customer, caller, number, text).",
    input_schema: {
      type: "object",
      properties: {
        what: { type: "string", enum: ["everything", "calls", "notes"], description: "Default everything." },
        query: { type: "string", description: "Optional words to filter on." },
        openOnly: { type: "boolean", description: "Only what is still to do. Default false." },
      },
    },
  },
  async run(ctx, input) {
    const scope: CallsScope | null = ctx.caps.includes("inbox")
      ? { all: true }
      : ctx.personId
        ? { all: false, personId: ctx.personId }
        : null;
    if (!scope) return { error: "not allowed for this person" };
    const what = str(input.what) || "everything";
    const q = str(input.query).toLowerCase();
    const openOnly = input.openOnly === true;
    const hit = (...parts: (string | null | undefined)[]) =>
      !q || parts.some((p) => (p ?? "").toLowerCase().includes(q));
    const out: Record<string, unknown> = {};

    if (what !== "notes") {
      const page = await loadCallsPage(ctx.supabase, { scope, viewerId: ctx.personId, tab: scope.all ? "all" : null, until: null });
      const rows = page.days
        .flatMap((d) => d.items)
        .filter((r) => (!openOnly || r.lane === "todo" || r.lane === "check"))
        .filter((r) => hit(r.summary, r.orgName, r.callerName, r.from_identity, r.lineName))
        .sort((a, b) => b.received_at.localeCompare(a.received_at))
        .slice(0, LIMIT);
      for (const r of rows) ctx.seen.set(r.id, "call");
      out.calls = rows.map((r) => ({
        id: r.id,
        when: `${danishDayKey(r.received_at)} ${danishTime(r.received_at)}`,
        direction: r.direction,
        group: r.lane,
        urgent: r.triage.urgent,
        from: r.callerName ?? r.from_identity,
        customer: r.orgName,
        line: r.lineName,
        internal: r.internal,
        summary: r.summary,
        promises: r.promises,
        durationSeconds: r.duration_seconds,
      }));
      out.callCounts = page.counts;
    }

    if (what !== "calls") {
      const board = await loadNotesBoard(ctx.supabase, { scope, viewerId: ctx.personId, locale: "en" });
      const open = board.columns.flatMap((c) => [...c.recent, ...c.older]);
      const notes = (openOnly ? open : [...open, ...board.done])
        .filter((n) => hit(n.body, n.speakerName, n.addresseeName))
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
        .slice(0, LIMIT);
      for (const n of notes) ctx.seen.set(n.id, "call");
      out.notes = notes.map((n) => ({
        id: n.id,
        when: `${n.dayKey} ${n.time}`,
        saidBy: n.speakerName,
        for: n.addresseeName,
        text: (n.body ?? "").slice(0, 200) || null,
        done: n.closedAt !== null,
        due: n.dueDate,
      }));
    }
    return out;
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
      "Read the service calendar (visits, deliveries, and anything added in Google) between two dates. With no dates: `entries` = from now, 30 days ahead (for 'my next appointment' take the first), and `recent` = the last 3 entries of the past 30 days (for 'my last / latest / most recent appointment' take the last).",
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
    // With no dates the past is read too: "my latest appointment" was answered
    // with "nothing in the next 30 days" (2 Oct) before it was.
    const withRecent = !isDay(fromIso) && !isDay(toIso);
    const now = new Date();
    const [r, past] = await Promise.all([
      adapter.listEvents(settings.calendarId, { from, to }),
      withRecent ? adapter.listEvents(settings.calendarId, { from: new Date(now.getTime() - 30 * 86_400_000), to: now }) : null,
    ]);
    if (!r.ok) return { error: r.error };
    ctx.seen.set("calendar", "calendar");
    const entry = (e: (typeof r.value)[number]) => ({
      // The id is what lets "move it" act on the entry just read out.
      eventId: e.id,
      title: e.title,
      kind: e.kind ?? "other",
      date: e.allDay ? e.start : e.start.slice(0, 10),
      time: e.allDay ? "all day" : `${danishTime(e.start)}–${danishTime(e.end)}`,
      location: e.location,
    });
    const upcoming = new Set(r.value.map((e) => e.id));
    return {
      entries: r.value.slice(0, 15).map(entry),
      ...(past?.ok
        ? { recent: past.value.filter((e) => !upcoming.has(e.id)).sort((a, b) => a.start.localeCompare(b.start)).slice(-3).map(entry) }
        : {}),
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

/* ----------------------------------------------------------- customers */

const findCustomer: AssistantTool = {
  caps: ["customers"],
  def: {
    name: "find_customer",
    description:
      "Find customers (organisations) by name, CVR, EAN, city or phone. Returns up to 8 with segment, address, contact details, payment terms, how many bikes they own and how many active service-agreement bikes they have.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Name or number as said." } },
      required: ["query"],
    },
  },
  async run(ctx, input) {
    const q = str(input.query);
    if (!q) return { error: "empty query" };
    const like = `%${ilikeEscape(q)}%`;
    const { data, error } = await ctx.supabase
      .from("organizations")
      .select(
        "id, legal_name, display_name_da, display_name_en, cvr_number, ean_number, address_line1, zip_code, city, phone, email, payment_terms_days, lifecycle_stage, recognition_prefix, segment:customer_segments(name_en, name_da)",
      )
      .is("deleted_at", null)
      .or(
        `legal_name.ilike.${like},display_name_da.ilike.${like},display_name_en.ilike.${like},cvr_number.ilike.${like},ean_number.ilike.${like},city.ilike.${like},phone.ilike.${like}`,
      )
      .order("legal_name")
      .limit(LIMIT);
    if (error) return { error: error.message };
    const ids = (data ?? []).map((o) => o.id as string);
    const [{ data: bikes }, { data: lines }] = await Promise.all([
      ids.length
        ? ctx.supabase.from("bikes").select("owner_organization_id").in("owner_organization_id", ids).is("deleted_at", null)
        : Promise.resolve({ data: [] as { owner_organization_id: string }[] }),
      ids.length
        ? ctx.supabase
            .from("service_agreement_bikes")
            .select("status, agreement:service_agreements!inner(organization_id, status)")
            .eq("status", "active")
            .eq("agreement.status", "active")
            .in("agreement.organization_id", ids)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    const count = (list: string[]) => list.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
    const bikeCount = count((bikes ?? []).map((b) => b.owner_organization_id as string));
    const coveredCount = count(
      ((lines ?? []) as { agreement: { organization_id: string } | null }[]).map((l) => l.agreement?.organization_id ?? ""),
    );
    for (const o of data ?? []) ctx.seen.set(o.id, "customer");
    return {
      customers: (data ?? []).map((o) => {
        const seg = o.segment as { name_en?: string; name_da?: string } | null;
        return {
          id: o.id,
          name: orgName(o),
          legalName: o.legal_name,
          segment: seg ? (seg.name_da ?? seg.name_en ?? null) : null,
          cvr: o.cvr_number,
          ean: o.ean_number,
          address: [o.address_line1, [o.zip_code, o.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
          phone: o.phone,
          email: o.email,
          paymentTermsDays: o.payment_terms_days,
          stage: o.lifecycle_stage,
          recognitionPrefix: o.recognition_prefix,
          bikes: bikeCount.get(o.id) ?? 0,
          bikesUnderAgreement: coveredCount.get(o.id) ?? 0,
        };
      }),
    };
  },
};

/* ---------------------------------------------------------- agreements */

const findAgreements: AssistantTool = {
  caps: ["agreements"],
  def: {
    name: "service_agreements",
    description:
      "Service agreements (contracts): per customer, with type (K1/K3/K5/K10 = years committed), status, dates, what is covered and how many bikes are on it. Optional `query` = customer name; `expiringWithinDays` lists active agreements ending soon. A bike's own coverage: find_bike first, then ask with the customer.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer name, optional." },
        expiringWithinDays: { type: "number", description: "Optional: only active agreements ending within this many days." },
      },
    },
  },
  async run(ctx, input) {
    const q = str(input.query);
    const within = typeof input.expiringWithinDays === "number" ? input.expiringWithinDays : null;
    let req = ctx.supabase
      .from("service_agreements")
      .select(
        "id, name_da, name_en, status, contract_type, start_date, end_date, signed_on, covers_parts, covers_labor, has_gps, monthly_fee, fee_currency, org:organizations!organization_id(legal_name, display_name_da, display_name_en), unit:organization_units(name), lines:service_agreement_bikes(status, yearly_price, currency)",
      )
      .order("end_date", { ascending: true, nullsFirst: false })
      .limit(LIMIT);
    if (q) {
      const { data: orgs } = await ctx.supabase
        .from("organizations")
        .select("id")
        .is("deleted_at", null)
        .or(`legal_name.ilike.%${ilikeEscape(q)}%,display_name_da.ilike.%${ilikeEscape(q)}%,display_name_en.ilike.%${ilikeEscape(q)}%`)
        .limit(20);
      const ids = (orgs ?? []).map((o) => o.id as string);
      if (ids.length === 0) return { agreements: [], note: "no customer matched" };
      req = req.in("organization_id", ids);
    }
    if (within !== null) {
      const until = new Date(Date.now() + within * 86_400_000).toISOString().slice(0, 10);
      req = req.eq("status", "active").not("end_date", "is", null).lte("end_date", until);
    }
    const { data, error } = await req;
    if (error) return { error: error.message };
    return {
      agreements: (data ?? []).map((a) => {
        const lines = (a.lines ?? []) as { status: string; yearly_price: number | null; currency: string | null }[];
        const active = lines.filter((l) => l.status === "active");
        return {
          name: a.name_da ?? a.name_en,
          customer: orgName(a.org as never),
          department: (a.unit as { name?: string } | null)?.name ?? null,
          status: a.status,
          type: a.contract_type,
          start: a.start_date,
          end: a.end_date,
          signed: a.signed_on,
          coversParts: a.covers_parts,
          coversLabour: a.covers_labor,
          gps: a.has_gps,
          activeBikes: active.length,
          endedBikes: lines.length - active.length,
          ...(ctx.canSeeCosts
            ? {
                yearlyTotal: active.reduce((n, l) => n + Number(l.yearly_price ?? 0), 0),
                currency: active[0]?.currency ?? a.fee_currency ?? "DKK",
                monthlyFee: a.monthly_fee,
              }
            : {}),
        };
      }),
    };
  },
};

/* ---------------------------------------------------------- purchasing */

const purchaseOrders: AssistantTool = {
  caps: ["po"],
  def: {
    name: "purchase_orders",
    description:
      "Purchase orders to suppliers, newest first: number, supplier, status (draft, placed, partially_received, received, cancelled), order/expected/received dates, total. Optional `query` = supplier name or part words (orders containing that part); `openOnly` = not yet fully received.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Supplier name or part words, optional." },
        openOnly: { type: "boolean" },
      },
    },
  },
  async run(ctx, input) {
    const q = str(input.query);
    let req = ctx.supabase
      .from("purchase_orders")
      .select("id, po_number, status, order_date, expected_date, received_date, total_amount, total_currency, supplier:suppliers(name), lines:purchase_order_lines(quantity, part:parts(name))")
      .order("created_at", { ascending: false })
      .limit(40);
    if (input.openOnly === true) req = req.in("status", ["draft", "placed", "partially_received"]);
    const { data, error } = await req;
    if (error) return { error: error.message };
    type Line = { quantity: number; part: { name: string } | null };
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (data ?? [])
      .filter((p) => {
        if (!words.length) return true;
        const hay = [(p.supplier as { name?: string } | null)?.name ?? "", ...((p.lines ?? []) as unknown as Line[]).map((l) => l.part?.name ?? "")]
          .join(" ")
          .toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, LIMIT);
    for (const p of rows) ctx.seen.set(p.id, "purchase_order");
    return {
      purchaseOrders: rows.map((p) => ({
        id: p.id,
        number: p.po_number,
        supplier: (p.supplier as { name?: string } | null)?.name ?? null,
        status: p.status,
        ordered: p.order_date,
        expected: p.expected_date,
        received: p.received_date,
        lines: ((p.lines ?? []) as unknown as Line[]).slice(0, 6).map((l) => `${l.quantity} × ${l.part?.name ?? "?"}`),
        ...(ctx.canSeeCosts ? { total: p.total_amount, currency: p.total_currency } : {}),
      })),
    };
  },
};

/* ------------------------------------------------------------ invoices */

const invoicesTool: AssistantTool = {
  caps: ["invoices"],
  def: {
    name: "invoices",
    description:
      "Invoices, newest first: number, customer, status (draft, issued, paid, overdue, credited, cancelled), issued/due/paid dates and amounts. Optional `query` = customer name; `unpaidOnly` = issued and not paid; `overdueOnly` = unpaid and past due.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer name, optional." },
        unpaidOnly: { type: "boolean" },
        overdueOnly: { type: "boolean" },
      },
    },
  },
  async run(ctx, input) {
    const q = str(input.query);
    let req = ctx.supabase
      .from("invoices")
      .select("id, invoice_number, status, kind, issued_date, due_date, paid_date, total_amount, currency, org:organizations!organization_id(legal_name, display_name_da, display_name_en)")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (input.unpaidOnly === true || input.overdueOnly === true) req = req.in("status", ["issued", "overdue"]);
    if (input.overdueOnly === true) req = req.lt("due_date", new Date().toISOString().slice(0, 10));
    if (q) {
      const { data: orgs } = await ctx.supabase
        .from("organizations")
        .select("id")
        .is("deleted_at", null)
        .or(`legal_name.ilike.%${ilikeEscape(q)}%,display_name_da.ilike.%${ilikeEscape(q)}%,display_name_en.ilike.%${ilikeEscape(q)}%`)
        .limit(20);
      const ids = (orgs ?? []).map((o) => o.id as string);
      if (ids.length === 0) return { invoices: [], note: "no customer matched" };
      req = req.in("organization_id", ids);
    }
    const { data, error } = await req;
    if (error) return { error: error.message };
    for (const i of data ?? []) ctx.seen.set(i.id, "invoice");
    return {
      invoices: (data ?? []).map((i) => ({
        id: i.id,
        number: i.invoice_number,
        customer: orgName(i.org as never),
        status: i.status,
        kind: i.kind,
        issued: i.issued_date,
        due: i.due_date,
        paid: i.paid_date,
        total: i.total_amount,
        currency: i.currency,
      })),
    };
  },
};

/* --------------------------------------------------------------- stock */

const lowStock: AssistantTool = {
  caps: ["parts"],
  def: {
    name: "low_stock",
    description:
      "Parts that are running low or out: on hand at or below 20 % of the last purchased quantity (the app's low-stock rule), or none at all. Up to 20, emptiest first. For one part's stock use find_part.",
    input_schema: { type: "object", properties: {} },
  },
  async run(ctx) {
    const [{ data: stock }, { data: last }] = await Promise.all([
      ctx.supabase.from("v_current_stock").select("part_id, quantity_on_hand"),
      ctx.supabase.from("v_part_last_cost").select("part_id, last_purchase_quantity").not("last_purchase_quantity", "is", null),
    ]);
    const onHand = new Map<string, number>();
    for (const r of stock ?? []) onHand.set(r.part_id, (onHand.get(r.part_id) ?? 0) + Number(r.quantity_on_hand ?? 0));
    const low = (last ?? [])
      .map((r) => ({ id: r.part_id as string, qty: onHand.get(r.part_id) ?? 0, last: Number(r.last_purchase_quantity) }))
      .filter((r) => r.qty <= 0 || r.qty <= r.last * 0.2)
      .sort((a, b) => a.qty / (a.last || 1) - b.qty / (b.last || 1))
      .slice(0, 20);
    if (low.length === 0) return { parts: [] };
    const { data: parts } = await ctx.supabase
      .from("parts")
      .select("id, name, internal_sku")
      .in("id", low.map((l) => l.id))
      .is("deleted_at", null);
    const byId = new Map((parts ?? []).map((p) => [p.id as string, p]));
    const rows = low.filter((l) => byId.has(l.id));
    for (const r of rows) ctx.seen.set(r.id, "part");
    return {
      parts: rows.map((r) => ({
        id: r.id,
        name: byId.get(r.id)?.name,
        sku: byId.get(r.id)?.internal_sku,
        onHand: r.qty,
        lastPurchased: r.last,
      })),
    };
  },
};

/* ------------------------------------------------- the whole database */

/**
 * The general lookup (migration 129): the model writes ONE SELECT and
 * `assistant_read_query` runs it as `assistant_reader` — SELECT-only, in a
 * read-only transaction, wrapped as a subquery, under a row and a cost cap.
 * Owner and IT admin only (`data_query`): it reads money and everyone's
 * records, which the per-area tools withhold from roles without the right.
 */
const databaseTables: AssistantTool = {
  caps: ["data_query"],
  def: {
    name: "database_tables",
    description:
      "The database's tables. With no `tables`: every table name. With `tables`: their columns and types. Use before database_query when unsure of names. Useful: organizations (customers), bikes, bike_identifiers (fleet_number = recognition code), service_agreements + service_agreement_bikes (contracts, per bike), offers/sales_orders/invoices (+ *_lines), purchase_orders + purchase_order_lines, suppliers, parts, inventory_movements, v_current_stock, v_part_last_cost, maintenance_tickets, work_orders, service_orders (paint orders), manufacturing_orders, inbound_messages (calls and notes), people, colors, bike_templates.",
    input_schema: {
      type: "object",
      properties: { tables: { type: "array", items: { type: "string" }, description: "Optional table names." } },
    },
  },
  async run(ctx, input) {
    const names = (Array.isArray(input.tables) ? input.tables : [])
      .filter((t): t is string => typeof t === "string" && /^[a-z_][a-z0-9_]*$/.test(t))
      .slice(0, 10);
    const sql = names.length
      ? `select table_name, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as columns from information_schema.columns where table_schema = 'public' and table_name in (${names.map((n) => `'${n}'`).join(",")}) group by table_name`
      : `select string_agg(table_name, ', ' order by table_name) as tables from information_schema.tables where table_schema = 'public'`;
    const { data, error } = await ctx.supabase.rpc("assistant_read_query", { q: sql, max_rows: 20 });
    if (error) return { error: error.message };
    return { result: data };
  },
};

const databaseQuery: AssistantTool = {
  caps: ["data_query"],
  def: {
    name: "database_query",
    description:
      "Run ONE read-only PostgreSQL SELECT (or WITH … SELECT) on the database, no semicolon; returns up to 100 rows as JSON. For anything the other tools do not cover: counts, sums, lists across tables. Money is (amount, currency) column pairs. Only some tables have deleted_at (organizations, bikes, parts, contacts, suppliers…) — check with database_tables before filtering on it. A service agreement's price is PER BIKE: service_agreement_bikes.yearly_price, joined on agreement_id, active lines only (status = 'active'); service_agreements.monthly_fee is the old fee model. Current stock = sum(quantity_on_hand) from v_current_stock per part. If a query fails, read the error, check names with database_tables, and try again.",
    input_schema: {
      type: "object",
      properties: { sql: { type: "string", description: "One SELECT statement." } },
      required: ["sql"],
    },
  },
  async run(ctx, input) {
    const sql = str(input.sql).replace(/;\s*$/, "");
    if (!sql) return { error: "empty query" };
    const { data, error } = await ctx.supabase.rpc("assistant_read_query", { q: sql, max_rows: 100 });
    if (error) return { error: error.message };
    const text = JSON.stringify(data);
    // Bounded: a wide row set would swamp the model's context.
    return text.length > 20_000 ? { truncated: true, firstRows: (data as unknown[]).slice(0, 20) } : { rows: data };
  },
};

/* --------------------------------------------------------------- paint */

/**
 * The PAINT SHELF and the paint runs — what /parts/painted and *Lakture* show,
 * through the same loaders, so "what's on the paint shelf?" is never "there is
 * no paint shelf" again (21 Oct, with 3 painted parts on it). No prices.
 */
/** Paint orders still in play after `planned`: sent, at the painter, ready to collect. */
const OPEN_PAINT_STATUSES = ["confirmed", ...AT_SUPPLIER_STATUSES];

const paintShelf: AssistantTool = {
  caps: ["parts", "work", "paint", "mo"],
  def: {
    name: "paint",
    description:
      "The paint shelf and the painter: painted parts on the shelf by colour (on hand, already promised to bikes being built, more on its way back), raw paintable parts not yet painted, the paint orders that are planned, sent, at the painter or ready to collect (drop-off and pickup dates), and how many bikes are at the painter or back painted. Optional filters: a colour (name or RAL) and words from a part's name.",
    input_schema: {
      type: "object",
      properties: {
        colour: { type: "string", description: "Optional colour name or RAL code." },
        part: { type: "string", description: "Optional words from the part's name or SKU." },
      },
    },
  },
  async run(ctx, input) {
    const s = ctx.supabase;
    const [lookup, partsRes, coloursRes, runsRes, states] = await Promise.all([
      loadPaintedStockLookup(s as never),
      s.from("parts").select("id, internal_sku, name_en, base_part_id, color_id").not("service_part_type_id", "is", null).is("deleted_at", null),
      s.from("colors").select("id, name_en, name_da, ral_code"),
      s
        .from("service_orders")
        .select("id, order_number, status, planned_send_date, pickup_date, supplier:suppliers!supplier_id(name), bikes:service_order_bikes(bike_id), items:service_order_items(quantity)")
        .in("status", ["planned", ...OPEN_PAINT_STATUSES])
        .order("planned_send_date", { ascending: true, nullsFirst: false })
        .limit(15),
      loadPaintStates(s as never),
    ]);
    const demand = await loadPaintedDemand(s as never, lookup);
    const parts = new Map((partsRes.data ?? []).map((p) => [p.id, p]));
    const colours = new Map((coloursRes.data ?? []).map((c) => [c.id, c]));
    const colourWord = str(input.colour).toLowerCase();
    const partWords = str(input.part).toLowerCase().split(/\s+/).filter(Boolean);
    const colourOk = (id: string | null) => {
      if (!colourWord) return true;
      const c = id ? colours.get(id) : null;
      return Boolean(c && [c.name_en, c.name_da, c.ral_code].some((v) => (v ?? "").toLowerCase().includes(colourWord.replace(/^ral\s*/, ""))));
    };
    const partOk = (p: { internal_sku: string | null; name_en: string | null }) =>
      partWords.every((w) => `${p.internal_sku ?? ""} ${p.name_en ?? ""}`.toLowerCase().includes(w));

    const shelf = [];
    for (const p of parts.values()) {
      if (!p.base_part_id || !p.color_id) continue;
      const base = parts.get(p.base_part_id);
      const key = `${p.base_part_id}:${p.color_id}`;
      const onHand = lookup.onHand.get(p.id) ?? 0;
      const promised = demand.promised.get(key) ?? 0;
      const coming = demand.atPainter.get(key) ?? 0;
      if (onHand === 0 && coming === 0) continue;
      if (!colourOk(p.color_id) || !partOk(base ?? p)) continue;
      ctx.seen.set(p.id, "part");
      shelf.push({ id: p.id, part: base?.name_en ?? p.name_en, colour: colourOf(colours.get(p.color_id) as never), onHand, promised, onItsWayBack: coming });
    }
    const raw = [...parts.values()]
      .filter((p) => !p.base_part_id && (lookup.onHand.get(p.id) ?? 0) > 0 && partOk(p))
      .map((p) => ({ part: p.name_en, sku: p.internal_sku, onHand: lookup.onHand.get(p.id) ?? 0 }))
      .sort((a, b) => b.onHand - a.onHand)
      .slice(0, 10);
    const runs = (runsRes.data ?? []).map((o) => {
      ctx.seen.set(o.id, "paint_order");
      return {
        id: o.id,
        number: o.order_number,
        status: o.status,
        dropOff: o.planned_send_date,
        pickup: o.pickup_date,
        painter: (one(o.supplier) as { name?: string } | null)?.name ?? null,
        bikes: (o.bikes ?? []).length,
        units: (o.items ?? []).reduce((n: number, i: { quantity: number | null }) => n + Number(i.quantity ?? 0), 0),
      };
    });
    return {
      paintedShelf: shelf.slice(0, 20),
      rawNotYetPainted: raw,
      paintOrders: runs,
      bikes: { atPainter: states.atPainter.size, backPainted: states.painted.size },
    };
  },
};

/* --------------------------------------------------------- recent work */

/**
 * "The last bike we worked on" — the bikes touched most recently: a status
 * change, a work order, a build. `mine` keeps only what the asker did.
 */
/** The bike statuses, in the order a list of them is read. */
const BIKE_STATUSES = ["in_service", "assigned", "in_stock", "building", "planning", "in_maintenance", "retired", "lost_or_stolen"] as const;

/** At most this many bikes come back by name; more is counted, not listed. */
const OVERVIEW_BIKES = 20;
/** The largest customers, by bikes, that are named in an overview. */
const OVERVIEW_CUSTOMERS = 10;

/**
 * "How many bikes", "list all the bikes", "which bikes does X have" — the
 * question find_bike (a search, 8 rows) cannot answer (2026-10-22). Counts
 * EVERY matching bike (paged past PostgREST's 1000-row cap) by status,
 * customer and family; names them only when there are few; and returns the
 * list pages that show them (`views`, kind bike_list), so a long answer is a
 * page to open, not a list to read aloud.
 */
const bikeOverview: AssistantTool = {
  caps: ["bikes", "work"],
  def: {
    name: "bike_overview",
    description: `COUNT bikes — all of them, or narrowed by status, customer or imported (from the fleet register). For "how many bikes", "list all the bikes", "which bikes does X have", "bikes in stock". Returns the total, counts by status, by customer (largest first) and by family; the bikes themselves when ${OVERVIEW_BIKES} or fewer match; and \`views\`: the bike list pages you may OPEN (kind bike_list) for the whole set and for each status and customer group.`,
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...BIKE_STATUSES], description: "Only bikes in this status." },
        customer: { type: "string", description: "Only bikes owned by this customer (a name)." },
        imported: { type: "boolean", description: "true: only bikes from the fleet register import." },
      },
    },
  },
  async run(ctx, input) {
    const status = (BIKE_STATUSES as readonly string[]).includes(str(input.status)) ? str(input.status) : undefined;
    const imported = input.imported === true;
    const name = str(input.customer);
    let owner: { id: string; name: string } | undefined;
    if (name) {
      const like = `%${ilikeEscape(name)}%`;
      const { data: orgs } = await ctx.supabase
        .from("organizations")
        .select("id, legal_name, display_name_da, display_name_en")
        .is("deleted_at", null)
        .or(`legal_name.ilike.${like},display_name_da.ilike.${like},display_name_en.ilike.${like}`)
        .limit(10);
      const found = (orgs ?? []).map((o) => ({ id: o.id as string, name: orgName(o) ?? "" }));
      const exact = found.filter((o) => o.name.toLowerCase() === name.toLowerCase());
      const pick = exact.length === 1 ? exact : found;
      for (const o of found) ctx.seen.set(o.id, "customer");
      if (pick.length === 0) return { total: 0, note: `no customer matched "${name}"` };
      if (pick.length > 1) return { note: "several customers match — ask which one", customers: pick };
      owner = pick[0];
    }

    type Row = { id: string; status: string; owner_organization_id: string | null; bike_template: unknown };
    const { data, error } = await fetchAllRows<Row>((from, to) => {
      let q = ctx.supabase
        .from("bikes")
        .select("id, status, owner_organization_id, bike_template:bike_templates(family:bike_families(name))")
        .is("deleted_at", null);
      if (status) q = q.eq("status", status);
      if (owner) q = q.eq("owner_organization_id", owner.id);
      if (imported) q = q.not("import_batch_id", "is", null);
      return q.order("id").range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
    });
    if (error) return { error };

    const tally = (key: (r: Row) => string | null) => {
      const m = new Map<string, number>();
      for (const r of data) {
        const k = key(r);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const byStatus = tally((r) => r.status);
    const byOwner = tally((r) => r.owner_organization_id ?? "none");
    const byFamily = tally((r) => (r.bike_template as { family?: { name?: string } | null } | null)?.family?.name ?? "no template");

    const topOwners = byOwner.filter(([id]) => id !== "none").slice(0, OVERVIEW_CUSTOMERS);
    const { data: orgs } = topOwners.length
      ? await ctx.supabase
          .from("organizations")
          .select("id, legal_name, display_name_da, display_name_en")
          .in("id", topOwners.map(([id]) => id))
      : { data: [] };
    const names = new Map((orgs ?? []).map((o) => [o.id as string, orgName(o) ?? "?"]));
    for (const [id] of topOwners) ctx.seen.set(id, "customer");

    // The pages that show these bikes — each one the person's list, filtered.
    const base: BikeListFilter = { status, owner: owner?.id, imported };
    const views: { kind: "bike_list"; id: string; label: string; count: number }[] = [];
    const view = (f: BikeListFilter, label: string, count: number) => {
      const id = bikeListId(f);
      ctx.seen.set(id, "bike_list");
      views.push({ kind: "bike_list", id, label, count });
    };
    view(base, "these bikes", data.length);
    if (!status) for (const [st, n] of byStatus) view({ ...base, status: st }, `status ${st}`, n);
    if (!owner) for (const [id, n] of topOwners) view({ ...base, owner: id }, names.get(id) ?? "customer", n);

    let bikes: unknown[] | undefined;
    if (data.length > 0 && data.length <= OVERVIEW_BIKES) {
      const ids = data.map((r) => r.id);
      const { data: codes } = await ctx.supabase
        .from("bike_identifiers")
        .select("bike_id, identifier_value, type:bike_identifier_types!inner(slug)")
        .eq("is_active", true)
        .eq("type.slug", "fleet_number")
        .in("bike_id", ids);
      const code = new Map((codes ?? []).map((c) => [c.bike_id as string, c.identifier_value as string]));
      const { data: rows } = await ctx.supabase.from("bikes").select("id, frame_number").in("id", ids);
      const frame = new Map((rows ?? []).map((r) => [r.id as string, r.frame_number as string]));
      bikes = data.map((r) => {
        ctx.seen.set(r.id, "bike");
        return {
          id: r.id,
          recognitionCode: code.get(r.id) ?? null,
          frameNumber: frame.get(r.id) ?? null,
          status: r.status,
          family: (r.bike_template as { family?: { name?: string } | null } | null)?.family?.name ?? null,
          owner: r.owner_organization_id ? (names.get(r.owner_organization_id) ?? null) : null,
        };
      });
    }

    return {
      filter: { status: status ?? null, customer: owner?.name ?? null, imported },
      total: data.length,
      byStatus: Object.fromEntries(byStatus),
      byCustomer: [
        ...topOwners.map(([id, n]) => ({ id, name: names.get(id) ?? "?", count: n })),
        ...(byOwner.length > topOwners.length ? [{ name: "others / no customer", count: data.length - topOwners.reduce((a, [, n]) => a + n, 0) }] : []),
      ],
      byFamily: Object.fromEntries(byFamily),
      ...(bikes ? { bikes } : { bikesListed: false, note: `${data.length} bikes — counted, not listed; open a view to show them` }),
      views,
    };
  },
};

const recentWork: AssistantTool = {
  caps: ["bikes", "work", "maintenance", "mo"],
  def: {
    name: "recent_work",
    description:
      "The bikes worked on most recently, newest first: a build finished, a work order opened or completed, a status change — with who did it when known. `mine` true keeps only what the asking person did. Default: the last 14 days, up to 8 bikes.",
    input_schema: {
      type: "object",
      properties: {
        mine: { type: "boolean", description: "Only the asker's own work. Default false." },
        days: { type: "number", description: "How far back, in days. Default 14." },
      },
    },
  },
  async run(ctx, input) {
    const s = ctx.supabase;
    const days = Math.min(90, Math.max(1, Number(input.days) || 14));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const me = input.mine === true ? ctx.personId : null;
    if (input.mine === true && !me) return { error: "who is asking is not known" };
    let changes = s.from("bike_state_log").select("bike_id, from_status, to_status, occurred_at, actor_id").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(60);
    let wos = s.from("work_orders").select("bike_id, wo_number, status, updated_at, assigned_to, completed_by").gte("updated_at", since).order("updated_at", { ascending: false }).limit(60);
    let builds = s.from("bikes").select("id, built_at, built_by").gte("built_at", since).is("deleted_at", null).order("built_at", { ascending: false }).limit(60);
    if (me) {
      changes = changes.eq("actor_id", me);
      wos = wos.or(`assigned_to.eq.${me},completed_by.eq.${me}`);
      builds = builds.eq("built_by", me);
    }
    const seesWork = ctx.caps.includes("work") || ctx.caps.includes("maintenance");
    const [c, w, b, people] = await Promise.all([changes, seesWork ? wos : null, builds, s.from("people").select("id, full_name")]);
    const who = new Map((people.data ?? []).map((p) => [p.id, p.full_name]));
    const events: { bikeId: string; at: string; what: string; by: string | null }[] = [];
    for (const r of c.data ?? []) events.push({ bikeId: r.bike_id, at: r.occurred_at, what: `status ${r.from_status ?? "—"} → ${r.to_status}`, by: r.actor_id ? (who.get(r.actor_id) ?? null) : null });
    for (const r of w?.data ?? []) {
      if (!r.bike_id) continue;
      const by = r.completed_by ?? r.assigned_to;
      events.push({ bikeId: r.bike_id, at: r.updated_at, what: `work order ${r.wo_number} (${r.status})`, by: by ? (who.get(by) ?? null) : null });
    }
    for (const r of b.data ?? []) if (r.built_at) events.push({ bikeId: r.id, at: r.built_at, what: "build finished", by: r.built_by ? (who.get(r.built_by) ?? null) : null });
    events.sort((x, y) => y.at.localeCompare(x.at));
    const latest = new Map<string, (typeof events)[number]>();
    for (const e of events) if (!latest.has(e.bikeId)) latest.set(e.bikeId, e);
    const ids = [...latest.keys()].slice(0, LIMIT);
    if (ids.length === 0) return { days, bikes: [] };
    const [{ data: bikes }, { data: codes }] = await Promise.all([
      s.from("bikes").select("id, frame_number, status, bike_template:bike_templates(family:bike_families(name), frame_size), owner:organizations!owner_organization_id(legal_name, display_name_da, display_name_en)").in("id", ids),
      s.from("bike_identifiers").select("bike_id, identifier_value, type:bike_identifier_types!inner(slug)").eq("is_active", true).eq("type.slug", "fleet_number").in("bike_id", ids),
    ]);
    const code = new Map((codes ?? []).map((x) => [x.bike_id as string, x.identifier_value as string]));
    const byId = new Map((bikes ?? []).map((x) => [x.id, x]));
    return {
      days,
      bikes: ids.flatMap((id) => {
        const bike = byId.get(id);
        if (!bike) return [];
        ctx.seen.set(id, "bike");
        const tpl = one(bike.bike_template) as { family?: unknown; frame_size?: string | null } | null;
        const e = latest.get(id)!;
        return [{
          id,
          recognitionCode: code.get(id) ?? null,
          frameNumber: bike.frame_number,
          status: bike.status,
          model: tpl ? [(one(tpl.family) as { name?: string } | null)?.name, tpl.frame_size].filter(Boolean).join(" ") || null : null,
          owner: orgName(one(bike.owner) as never),
          last: { what: e.what, at: e.at, by: e.by },
        }];
      }),
    };
  },
};

/* ------------------------------------------------- database schema digest */

/** The tables a lookup usually needs — their columns ride in `database_query`'s description. */
const SCHEMA_TABLES = [
  "organizations", "organization_units", "contacts", "people", "bikes", "bike_identifiers", "bike_templates",
  "service_agreements", "service_agreement_bikes", "offers", "offer_lines", "sales_orders", "sales_order_lines",
  "invoices", "invoice_lines", "purchase_orders", "purchase_order_lines", "suppliers", "parts",
  "inventory_movements", "v_current_stock", "maintenance_tickets", "work_orders", "service_orders",
  "manufacturing_orders", "inbound_messages",
];
let schemaDigest: { at: number; text: string } | null = null;

/**
 * `database_query` with the main tables' columns in its description, so a
 * question does not start with a schema lookup — or a guessed column (Benny,
 * 21 Oct: `direction does not exist`, then two more lookups). Read from the
 * live schema through the same read-only door, kept for an hour, in a fixed
 * order so the cached prompt stays byte-identical. Only what
 * `assistant_reader` may read is listed.
 */
export async function withDatabaseSchema(supabase: SupabaseClient, defs: unknown[]): Promise<unknown[]> {
  const i = defs.findIndex((d) => (d as { name?: string }).name === "database_query");
  if (i < 0) return defs;
  if (!schemaDigest || Date.now() - schemaDigest.at > 3_600_000) {
    const sql = `select table_name, string_agg(column_name, ', ' order by ordinal_position) as columns from information_schema.columns where table_schema = 'public' and table_name in (${SCHEMA_TABLES.map((t) => `'${t}'`).join(",")}) group by table_name order by table_name`;
    const { data, error } = await supabase.rpc("assistant_read_query", { q: sql, max_rows: 40 });
    if (error || !Array.isArray(data)) return defs;
    const text = (data as { table_name: string; columns: string }[]).map((r) => `${r.table_name}(${r.columns})`).join("; ");
    schemaDigest = { at: Date.now(), text };
  }
  const def = defs[i] as { description: string };
  const out = [...defs];
  out[i] = { ...def, description: `${def.description} Columns of the main tables (use these names; database_tables for any other): ${schemaDigest.text}` };
  return out;
}

export const ASSISTANT_TOOLS: AssistantTool[] = [
  inbox,
  findBike,
  bikeOverview,
  recentWork,
  findPart,
  paintShelf,
  lowStock,
  calendarEntries,
  openTickets,
  findDocument,
  findCustomer,
  findAgreements,
  purchaseOrders,
  invoicesTool,
  databaseTables,
  databaseQuery,
];

/** The read tools THIS person's assistant gets. */
export function toolsFor(caps: readonly string[]): AssistantTool[] {
  return ASSISTANT_TOOLS.filter((t) => t.caps.some((c) => caps.includes(c)));
}
