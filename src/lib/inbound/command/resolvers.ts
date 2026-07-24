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

const LIMIT = 8;

/** Anthropic tool defs for the resolver toolset (agent loop, tool_choice auto). */
export const RESOLVER_TOOLS = [
  {
    name: "search_customer",
    description:
      "Find existing customer organizations by name. Returns up to 8 matches with id + label. Empty → the customer isn't in the system yet (you may propose creating it).",
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
] as const;

export const RESOLVER_NAMES = new Set<string>(RESOLVER_TOOLS.map((t) => t.name));

function pick(nameEn: string | null, nameDa: string | null): string {
  return nameDa || nameEn || "—";
}

function ilikeEscape(q: string): string {
  // These needles are interpolated into a PostgREST `.or()` filter STRING, so
  // two hazards, both handled here:
  //  1. LIKE wildcards (% _) and backslash — escaped so a stray char can't
  //     match everything.
  //  2. The or()-grammar chars (comma = OR-separator, parens = grouping) —
  //     replaced with a % wildcard so a customer name like "Jensen, Inc." or
  //     "Hotel (København)" neither breaks nor injects the filter, and still
  //     matches (the wildcard spans the removed punctuation).
  return q
    .replace(/[%_\\]/g, (m) => `\\${m}`)
    .replace(/[(),]/g, "%");
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
      return {
        matches: (data ?? []).map((o) => ({
          id: o.id,
          label: o.display_name_da || o.display_name_en || o.legal_name,
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
