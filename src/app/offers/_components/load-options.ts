import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import type {
  ContactOption,
  CurrencyOption,
  OrgOption,
  OrgUnitOption,
} from "./offer-form";

/**
 * Customer / unit / contact / currency choices for the offer form, loaded once
 * and shared by the new and edit pages so the two can't drift on which
 * organizations they offer.
 */
export async function loadOfferFormOptions(
  supabase: SupabaseClient<Database>,
  noNameLabel: string,
): Promise<{
  organizations: OrgOption[];
  units: OrgUnitOption[];
  contacts: ContactOption[];
  currencies: CurrencyOption[];
}> {
  const [orgsRes, unitsRes, contactsRes, currenciesRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, legal_name, display_name_en, display_name_da, default_vat_code, billing_currency, preferred_language",
      )
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("legal_name", { ascending: true }),
    supabase
      .from("organization_units")
      .select("id, organization_id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, organization_id, first_name, last_name, role")
      .is("deleted_at", null)
      .order("last_name", { ascending: true }),
    supabase
      .from("currencies")
      .select("code")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  return {
    organizations: (orgsRes.data ?? []).map((o) => ({
      id: o.id,
      name: o.display_name_da ?? o.display_name_en ?? o.legal_name,
      default_vat_code: o.default_vat_code,
      billing_currency: o.billing_currency,
      preferred_language: o.preferred_language === "en" ? "en" : "da",
    })),
    units: unitsRes.data ?? [],
    contacts: (contactsRes.data ?? []).map((c) => ({
      id: c.id,
      organization_id: c.organization_id,
      label: `${[c.first_name, c.last_name].filter(Boolean).join(" ").trim() || noNameLabel}${c.role ? ` · ${c.role}` : ""}`,
    })),
    currencies: currenciesRes.data ?? [],
  };
}
