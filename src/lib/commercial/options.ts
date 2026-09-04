/**
 * The picker data and the row mapping a commercial document's lines need,
 * loaded once instead of inlined per page.
 *
 * Both detail pages held the same four vocab queries, the same family-adjacent
 * template sort and the same row mapping, copied. That cost was not theoretical:
 * adding the catalogue price prefill meant editing the identical query and the
 * identical mapping in two files, and a third document type would have made it
 * three. The lines TABLE differs between documents; none of this does.
 *
 * Server-only — it queries.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { localizedName } from "@/i18n/vocab";

import type {
  ColorChoice,
  CommercialLineRow,
  PartChoice,
  TemplateChoice,
  VatCodeChoice,
} from "./lines";

/** The columns a line row needs, including the three embeds it renders from.
 *  The parent FK is not here — the caller filters on it. */
export const COMMERCIAL_LINE_SELECT = `
  id, line_number, part_id, bike_template_id, quantity, unit_price,
  vat_code, vat_rate, line_subtotal, line_vat_amount, line_total,
  color_id, description_en, description_da,
  part:parts!part_id(id, internal_sku, name_en),
  template:bike_templates!bike_template_id(id, name_en, family:bike_families(name), frame_size),
  color:colors!color_id(name_en, name_da)
` as const;

/** What `COMMERCIAL_LINE_SELECT` returns, loosely — numerics arrive as strings
 *  from PostgREST, and every embed can be absent. */
export type RawCommercialLine = {
  id: string;
  line_number: number;
  part_id: string | null;
  bike_template_id: string | null;
  quantity: number | string;
  unit_price: number | string | null;
  vat_code: string | null;
  vat_rate: number | string | null;
  line_subtotal: number | string | null;
  line_vat_amount: number | string | null;
  line_total: number | string | null;
  color_id: string | null;
  description_en: string | null;
  description_da: string | null;
  part?: { internal_sku: string; name_en: string } | null;
  template?: {
    name_en: string;
    frame_size: string | null;
    family?: { name: string } | null;
  } | null;
  color?: { name_en: string; name_da: string | null } | null;
};

/** One stored line as the shared table renders it. */
export function toCommercialLineRow(
  l: RawCommercialLine,
  locale: string,
): CommercialLineRow {
  return {
    id: l.id,
    lineNumber: l.line_number,
    kind: l.bike_template_id ? "template" : "part",
    partId: l.part_id ?? null,
    partSku: l.part?.internal_sku ?? null,
    partName: l.part?.name_en ?? null,
    bikeTemplateId: l.bike_template_id ?? null,
    templateLabel: l.template
      ? [l.template.family?.name, l.template.frame_size, l.template.name_en]
          .filter(Boolean)
          .join(" · ")
      : null,
    colorId: l.color_id ?? null,
    colorName: l.color
      ? localizedName(locale, l.color.name_en, l.color.name_da)
      : null,
    quantity: Number(l.quantity),
    // offer_lines.unit_price is nullable where the SO's is not; 0 is the honest
    // reading of a line that never got one.
    unitPrice: Number(l.unit_price ?? 0),
    vatCode: l.vat_code ?? null,
    vatRate: Number(l.vat_rate ?? 0),
    subtotal: Number(l.line_subtotal ?? 0),
    vatAmount: Number(l.line_vat_amount ?? 0),
    total: Number(l.line_total ?? 0),
    descriptionEn: l.description_en ?? null,
    descriptionDa: l.description_da ?? null,
  };
}

export type CommercialLineOptions = {
  parts: PartChoice[];
  templates: TemplateChoice[];
  vatCodes: VatCodeChoice[];
  colors: ColorChoice[];
};

/**
 * Everything the line dialog picks from. Templates come back in
 * family-adjacent order — admin `sort_order`, then family, then size — so all
 * sizes of e.g. "Norma" sit together instead of interleaving by size.
 */
export async function loadCommercialLineOptions(
  supabase: SupabaseClient<Database>,
): Promise<CommercialLineOptions> {
  const [partsRes, templatesRes, vatRes, colorsRes] = await Promise.all([
    supabase
      .from("parts")
      .select(
        "id, internal_sku, name_en, default_retail_price, default_retail_currency",
      )
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
    // bike_templates archives with is_current, not deleted_at.
    supabase
      .from("bike_templates")
      .select(
        "id, name_en, family_id, family:bike_families(name, sort_order), frame_size, default_retail_price, default_retail_currency",
      )
      .eq("is_current", true)
      .order("frame_size", { ascending: true }),
    supabase
      .from("vat_codes")
      .select("code, name_en, name_da, default_rate")
      .eq("is_active", true)
      .order("default_rate", { ascending: false }),
    supabase
      .from("colors")
      .select("id, name_en, name_da, hex, ral_code, coating")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
  ]);

  return {
    parts: (partsRes.data ?? []).map((p) => ({
      id: p.id,
      internal_sku: p.internal_sku,
      name_en: p.name_en,
      default_retail_price:
        p.default_retail_price != null ? Number(p.default_retail_price) : null,
      default_retail_currency: p.default_retail_currency,
    })),
    templates: (templatesRes.data ?? [])
      .map((tpl) => ({
        id: tpl.id,
        name_en: tpl.name_en,
        family: tpl.family?.name ?? null,
        family_id: tpl.family_id ?? null,
        family_sort: tpl.family?.sort_order ?? null,
        frame_size: tpl.frame_size,
        default_retail_price:
          tpl.default_retail_price != null
            ? Number(tpl.default_retail_price)
            : null,
        default_retail_currency: tpl.default_retail_currency,
      }))
      .sort(
        (a, b) =>
          (a.family_sort ?? Number.MAX_SAFE_INTEGER) -
            (b.family_sort ?? Number.MAX_SAFE_INTEGER) ||
          (a.family ?? a.name_en).localeCompare(b.family ?? b.name_en) ||
          (a.frame_size ?? "").localeCompare(b.frame_size ?? "", undefined, {
            numeric: true,
          }) ||
          a.name_en.localeCompare(b.name_en),
      ),
    vatCodes: (vatRes.data ?? []).map((v) => ({
      code: v.code,
      name_en: v.name_en,
      name_da: v.name_da,
      default_rate: Number(v.default_rate),
    })),
    colors: colorsRes.data ?? [],
  };
}
