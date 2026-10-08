/**
 * Read-only RESOLVERS — the tools the command agent (agent.ts) MUST call to
 * ground every reference before proposing a draft action. Deterministic DB
 * lookups, never the model's guess (docs/plan-voice-commands.md, "the model
 * proposes, code disposes"): exactly-one → the agent fills the id; several →
 * it reports the ambiguity (reviewer picks); none → an open slot, or (customers
 * only) an offer to create. Resolvers NEVER write and NEVER invent — a part or
 * template that doesn't exist stays unresolved.
 *
 * Each resolver returns compact JSON the agent reads back as a tool_result.
 * Labels are Danish-first (name_da || name_en) to match the shop; they're a
 * review aid, re-rendered as chips in the plan panel.
 *
 * Server-only (Supabase service client). The endpoint list here is the agent's
 * entire read surface — mirrors matcher patterns (match.ts) without importing
 * its voicemail-shaped logic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ilikeEscape } from "@/lib/supabase/ilike";
import { recognitionCodeVariants } from "../match";
import { findCalendarEntries } from "@/lib/calendar/entries";
import { danishMidnight, shiftDayKey } from "@/lib/calls/days";

/** The recognition-code identifier type (migration 65/102), as in match.ts. */
const FLEET_TYPE = "f1ee7000-0000-4000-8000-000000000001";

const LIMIT = 8;

/** Anthropic tool defs for the resolver toolset (agent loop, tool_choice auto). */
export const RESOLVER_TOOLS = [
  {
    name: "search_customer",
    description:
      "Find existing customer organizations by name. Returns up to 8 `matches` with id + label. When nothing matches exactly it returns `close` — similar spellings (a transcript often garbles names: 'Fredericksburg Community' for 'Frederiksberg Kommune'). NEVER fill an id from `close`: leave organizationId null and mention the closest one; the person picks. Only when both are empty is the customer new.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer/organization name as spoken." },
      },
      required: ["query"],
    },
  },
  {
    name: "resolve_customer_segment",
    description:
      "Resolve a customer segment (Hotel, Municipality, Hospital, Facility Management, B2B, B2C) to its id. Call when proposing a new customer.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Segment name or a clue ('a hotel')." },
      },
      required: ["query"],
    },
  },
  {
    name: "resolve_template",
    description:
      "Resolve a bike model/template (e.g. 'Norma S') to its id. Frame size is part of the template. Returns current templates only.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Model/template name as spoken." },
      },
      required: ["query"],
    },
  },
  {
    name: "resolve_color",
    description: "Resolve a colour name ('red', 'rød') to a seeded colour id.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Colour as spoken." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_part",
    description:
      "Find a catalog part by name or SKU. Returns up to 8 matches with id + sku + label. Never invent a part — if nothing matches, leave it unresolved.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Part name or SKU as spoken." },
      },
      required: ["query"],
    },
  },
  {
    name: "resolve_part_via_recipe",
    description:
      "Find a part by its ROLE within a bike model's recipe — e.g. 'the motor for Norma XL'. Resolves the template, then filters its bill-of-materials parts by the keyword. Use this when a part is described by function + model rather than by name.",
    input_schema: {
      type: "object",
      properties: {
        template: { type: "string", description: "The bike model whose recipe to search." },
        keyword: {
          type: "string",
          description: "The part's role/keyword ('motor', 'display', 'battery').",
        },
      },
      required: ["template", "keyword"],
    },
  },
  {
    name: "find_bike",
    description:
      "Find a bike by its recognition code (the label on the bike, e.g. 'GKOK01' — spoken 'G K O K nul et') or its frame number. Returns up to 8 `matches` with id, label and the customer that owns it. Fill a bikeId ONLY when exactly one bike matched.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The code or frame number as said; letters and digits." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_contact",
    description:
      "Find a contact PERSON by name ('Christina'), optionally within one customer. Returns up to 8 `matches` with id, name, customer and current phone/email. Fill a contactId ONLY when exactly one person matched.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The person's name as said." },
        organizationId: { type: "string", description: "Optional: only contacts of this customer." },
      },
      required: ["query"],
    },
  },
  {
    name: "find_calendar_entry",
    description:
      "Find an entry already in the service calendar — to MOVE or DELETE it. Give words from its title (customer, errand) and, if said, its day. Returns up to 8 `matches` with eventId, title and start. Fill an eventId ONLY when exactly one entry matched.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words from the entry's title, e.g. the customer: 'Gladsaxe'." },
        date: { type: "string", description: "Optional: the entry's CURRENT day, YYYY-MM-DD." },
      },
      required: ["query"],
    },
  },
] as const;

export const RESOLVER_NAMES = new Set<string>(RESOLVER_TOOLS.map((t) => t.name));

function pick(nameEn: string | null, nameDa: string | null): string {
  return nameDa || nameEn || "—";
}


type ResolverInput = Record<string, unknown>;

/**
 * Execute one resolver call. Returns plain JSON for the tool_result. Unknown
 * tool or a bad query returns an { error } object the agent can read and
 * recover from, never throws into the loop.
 */
export async function executeResolver(
  supabase: SupabaseClient,
  name: string,
  input: ResolverInput,
): Promise<unknown> {
  const query = typeof input.query === "string" ? input.query.trim() : "";

  switch (name) {
    case "search_customer": {
      if (!query) return { error: "empty query" };
      const q = `%${ilikeEscape(query)}%`;
      const { data, error } = await supabase
        .from("organizations")
        .select("id, legal_name, display_name_en, display_name_da")
        .is("deleted_at", null)
        .or(
          `legal_name.ilike.${q},display_name_en.ilike.${q},display_name_da.ilike.${q}`,
        )
        .limit(LIMIT);
      if (error) return { error: error.message };
      const matches = (data ?? []).map((o) => ({
        id: o.id,
        label: o.display_name_da || o.display_name_en || o.legal_name,
      }));
      if (matches.length > 0) return { matches };
      // Nothing by substring — offer close spellings (migration 121), for the
      // person to choose from, never for the model to fill in.
      const { data: close } = await supabase.rpc("search_organizations_fuzzy", { q: query, lim: 5 });
      return {
        matches: [],
        close: (close ?? []).map((c: { id: string; label: string; score: number }) => ({
          id: c.id,
          label: c.label,
          similarity: Math.round(c.score * 100) / 100,
        })),
      };
    }

    case "find_bike": {
      if (!query) return { error: "empty query" };
      const codes = recognitionCodeVariants(query);
      const [byCode, byFrame] = await Promise.all([
        supabase
          .from("bike_identifiers")
          .select("identifier_value, bike:bikes!inner(id, frame_number, deleted_at, owner_organization_id)")
          .eq("identifier_type_id", FLEET_TYPE)
          .eq("is_active", true)
          .in("identifier_value", codes)
          .limit(LIMIT),
        supabase
          .from("bikes")
          .select("id, frame_number, deleted_at, owner_organization_id")
          .is("deleted_at", null)
          .ilike("frame_number", `%${ilikeEscape(query.replace(/\s+/g, ""))}%`)
          .limit(LIMIT),
      ]);
      type B = { id: string; frame_number: string; deleted_at: string | null; owner_organization_id: string | null };
      const found = new Map<string, { bike: B; code: string | null }>();
      for (const r of byCode.data ?? []) {
        const bike = (Array.isArray(r.bike) ? r.bike[0] : r.bike) as B | null;
        if (bike && !bike.deleted_at) found.set(bike.id, { bike, code: r.identifier_value });
      }
      for (const b of (byFrame.data ?? []) as B[]) if (!found.has(b.id)) found.set(b.id, { bike: b, code: null });
      const orgIds = [...new Set([...found.values()].map((f) => f.bike.owner_organization_id).filter(Boolean))] as string[];
      const orgs = new Map<string, string>();
      if (orgIds.length) {
        const { data } = await supabase
          .from("organizations")
          .select("id, legal_name, display_name_da, display_name_en")
          .in("id", orgIds);
        for (const o of data ?? []) orgs.set(o.id, o.display_name_da || o.display_name_en || o.legal_name);
      }
      return {
        matches: [...found.values()].slice(0, LIMIT).map(({ bike, code }) => ({
          id: bike.id,
          label: code ? `${code} (${bike.frame_number})` : bike.frame_number,
          organizationId: bike.owner_organization_id,
          organizationLabel: bike.owner_organization_id ? (orgs.get(bike.owner_organization_id) ?? null) : null,
        })),
      };
    }

    case "search_contact": {
      if (!query) return { error: "empty query" };
      const words = query.split(/\s+/).filter(Boolean).slice(0, 3);
      let q = supabase
        .from("contacts")
        .select("id, first_name, last_name, phone, email, organization_id")
        .is("deleted_at", null)
        .limit(LIMIT);
      for (const w of words) {
        const like = `%${ilikeEscape(w)}%`;
        q = q.or(`first_name.ilike.${like},last_name.ilike.${like}`);
      }
      if (typeof input.organizationId === "string" && input.organizationId) {
        q = q.eq("organization_id", input.organizationId);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      const orgIds = [...new Set((data ?? []).map((c) => c.organization_id).filter(Boolean))] as string[];
      const orgs = new Map<string, string>();
      if (orgIds.length) {
        const { data: o } = await supabase
          .from("organizations")
          .select("id, legal_name, display_name_da, display_name_en")
          .in("id", orgIds);
        for (const x of o ?? []) orgs.set(x.id, x.display_name_da || x.display_name_en || x.legal_name);
      }
      return {
        matches: (data ?? []).map((c) => ({
          id: c.id,
          name: [c.first_name, c.last_name].filter(Boolean).join(" "),
          organizationId: c.organization_id,
          organizationLabel: c.organization_id ? (orgs.get(c.organization_id) ?? null) : null,
          phone: c.phone,
          email: c.email,
        })),
      };
    }

    case "find_calendar_entry": {
      const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
      // A named day: that day. Otherwise from yesterday to a month ahead.
      const from = date ? danishMidnight(date) : new Date(Date.now() - 86_400_000);
      const to = date ? danishMidnight(shiftDayKey(date, 1)) : new Date(Date.now() + 31 * 86_400_000);
      const r = await findCalendarEntries(supabase, { words: query.split(/\s+/), from, to });
      if (!r.ok) return { error: r.detail };
      return {
        matches: r.events.slice(0, LIMIT).map((e) => ({
          eventId: e.id,
          title: e.title,
          start: e.start,
          allDay: e.allDay,
          madeByTheApp: e.kind !== null,
        })),
      };
    }

    case "resolve_customer_segment": {
      const { data, error } = await supabase
        .from("customer_segments")
        .select("id, slug, name_en, name_da")
        .eq("is_active", true);
      if (error) return { error: error.message };
      const needle = query.toLowerCase();
      const all = (data ?? []).map((s) => ({
        id: s.id,
        label: pick(s.name_en, s.name_da),
        hay: `${s.slug} ${s.name_en} ${s.name_da}`.toLowerCase(),
      }));
      const matches = needle
        ? all.filter((s) => s.hay.includes(needle))
        : all;
      // If the clue didn't narrow it, hand back the whole vocab so the agent
      // (or reviewer) can choose rather than guess.
      const list = (matches.length > 0 ? matches : all).map((s) => ({
        id: s.id,
        label: s.label,
      }));
      return { matches: list };
    }

    case "resolve_template": {
      if (!query) return { error: "empty query" };
      const q = `%${ilikeEscape(query)}%`;
      const { data, error } = await supabase
        .from("bike_templates")
        .select("id, name_en, name_da, frame_size, is_current")
        .eq("is_current", true)
        .or(`name_en.ilike.${q},name_da.ilike.${q}`)
        .limit(LIMIT);
      if (error) return { error: error.message };
      return {
        matches: (data ?? []).map((tpl) => ({
          id: tpl.id,
          label: [pick(tpl.name_en, tpl.name_da), tpl.frame_size]
            .filter(Boolean)
            .join(" · "),
        })),
      };
    }

    case "resolve_color": {
      if (!query) return { error: "empty query" };
      const q = `%${ilikeEscape(query)}%`;
      const { data, error } = await supabase
        .from("colors")
        .select("id, slug, name_en, name_da")
        .eq("is_active", true)
        .or(`name_en.ilike.${q},name_da.ilike.${q},slug.ilike.${q}`)
        .limit(LIMIT);
      if (error) return { error: error.message };
      return {
        matches: (data ?? []).map((c) => ({
          id: c.id,
          label: pick(c.name_en, c.name_da),
        })),
      };
    }

    case "search_part": {
      if (!query) return { error: "empty query" };
      const q = `%${ilikeEscape(query)}%`;
      const { data, error } = await supabase
        .from("parts")
        .select("id, internal_sku, name_en, name_da")
        .is("deleted_at", null)
        .or(`name_en.ilike.${q},name_da.ilike.${q},internal_sku.ilike.${q}`)
        .limit(LIMIT);
      if (error) return { error: error.message };
      return {
        matches: (data ?? []).map((p) => ({
          id: p.id,
          sku: p.internal_sku,
          label: pick(p.name_en, p.name_da),
        })),
      };
    }

    case "resolve_part_via_recipe": {
      const template = typeof input.template === "string" ? input.template.trim() : "";
      const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
      if (!template || !keyword) return { error: "template and keyword required" };
      const tq = `%${ilikeEscape(template)}%`;
      const { data: tpls, error: tErr } = await supabase
        .from("bike_templates")
        .select("id, name_en, name_da")
        .eq("is_current", true)
        .or(`name_en.ilike.${tq},name_da.ilike.${tq}`)
        .limit(4);
      if (tErr) return { error: tErr.message };
      if (!tpls || tpls.length === 0) return { matches: [], note: "template not found" };
      if (tpls.length > 1) {
        return {
          matches: [],
          note: "multiple templates matched; resolve the template first",
          templates: tpls.map((t) => ({ id: t.id, label: pick(t.name_en, t.name_da) })),
        };
      }
      const templateId = tpls[0].id;
      // BOM parts for the one template, then filter by keyword on name/category.
      const { data: bom, error: bErr } = await supabase
        .from("bike_template_parts")
        .select(
          "part_id, part:parts!inner(id, internal_sku, name_en, name_da, deleted_at, category:part_categories(name_en, name_da))",
        )
        .eq("template_id", templateId);
      if (bErr) return { error: bErr.message };
      const needle = keyword.toLowerCase();
      const matches: { id: string; sku: string; label: string }[] = [];
      for (const row of bom ?? []) {
        const p = (Array.isArray(row.part) ? row.part[0] : row.part) as {
          id: string;
          internal_sku: string;
          name_en: string | null;
          name_da: string | null;
          deleted_at: string | null;
          category: { name_en: string | null; name_da: string | null } | { name_en: string | null; name_da: string | null }[] | null;
        } | null;
        if (!p || p.deleted_at) continue;
        const cat = Array.isArray(p.category) ? p.category[0] : p.category;
        const hay = `${p.name_en ?? ""} ${p.name_da ?? ""} ${p.internal_sku} ${cat?.name_en ?? ""} ${cat?.name_da ?? ""}`.toLowerCase();
        if (hay.includes(needle)) {
          matches.push({
            id: p.id,
            sku: p.internal_sku,
            label: pick(p.name_en, p.name_da),
          });
        }
      }
      return { matches, template: pick(tpls[0].name_en, tpls[0].name_da) };
    }

    default:
      return { error: `unknown resolver: ${name}` };
  }
}
