/**
 * Deterministic inbound matcher (Slice D) — channel-blind. Given the sender
 * identity + the extraction payload, it resolves candidate organizations,
 * contacts and bikes by ordered probes, and attaches one only when EXACTLY
 * one survives; otherwise it hands the candidate lists to the reviewer. The
 * model never decides identity — this is plain code, so a wrong attach is a
 * bug we can reproduce, not a hallucination.
 *
 * Probes (in order):
 *   1. Phone (from_identity / spoken callback) → contacts.phone → org
 *   2. Spoken org name → trigram-ish ILIKE on organizations legal/display name
 *   3. Frame / QR / fleet number → bike_identifiers exact
 *   4. Fallback: if exactly one org is known and no bike yet, that org's fleet
 *      filtered by colour / type hints
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboundExtraction } from "./extraction";
import { localizedName } from "@/i18n/vocab";

// Seeded identifier-type ids (migration 65/01). Fixed, so probes need no
// per-call slug lookup.
const FRAME_TYPE = "99561589-1119-4fac-9b88-a2237abf2862";
const QR_TYPE = "7aef74fd-377b-421d-b185-43a81c44a1b8";
const FLEET_TYPE = "f1ee7000-0000-4000-8000-000000000001";

const MAX_CANDIDATES = 10;

export type OrgCandidate = { id: string; name: string; via: "name" | "contact" };
export type ContactCandidate = {
  id: string;
  name: string;
  phone: string | null;
  organizationId: string | null;
};
export type BikeCandidate = {
  id: string;
  frameNumber: string;
  organizationId: string | null;
  via: "frame" | "qr" | "fleet" | "fleet_filter";
};

export type MatchCandidates = {
  organizations: OrgCandidate[];
  contacts: ContactCandidate[];
  bikes: BikeCandidate[];
  /** Non-blocking notes for the reviewer (e.g. "phone probe skipped"). */
  notes: string[];
};

export type MatchResult = {
  candidates: MatchCandidates;
  matchedOrganizationId: string | null;
  matchedContactId: string | null;
  matchedBikeId: string | null;
};

/** Digits only; DK numbers are 8 digits, so compare on the last 8. */
function phoneSuffix(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 6) return null;
  return d.slice(-8);
}

/** The single id if a candidate list resolves to exactly one distinct id. */
function soleId<T extends { id: string }>(items: T[]): string | null {
  const ids = Array.from(new Set(items.map((i) => i.id)));
  return ids.length === 1 ? ids[0] : null;
}

export async function matchInbound(
  supabase: SupabaseClient,
  input: { fromIdentity: string | null; extraction: InboundExtraction },
  locale = "en",
): Promise<MatchResult> {
  const { fromIdentity, extraction } = input;
  const notes: string[] = [];
  const contacts: ContactCandidate[] = [];
  const organizations: OrgCandidate[] = [];
  const bikes: BikeCandidate[] = [];

  // 1) Phone → contacts. Stored phones carry varied formatting (+45, spaces),
  // so we normalize in memory. Fine at current scale; if the contact book
  // grows large, push a normalized-phone column + index (noted).
  const suffixes = Array.from(
    new Set(
      [phoneSuffix(fromIdentity), phoneSuffix(extraction.callbackNumber)].filter(
        (s): s is string => !!s,
      ),
    ),
  );
  if (suffixes.length > 0) {
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, organization_id")
      .not("phone", "is", null)
      .is("deleted_at", null)
      .limit(5000);
    for (const c of contactRows ?? []) {
      const cs = phoneSuffix(c.phone);
      if (cs && suffixes.includes(cs)) {
        contacts.push({
          id: c.id,
          name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
          phone: c.phone,
          organizationId: c.organization_id,
        });
      }
    }
  } else if (fromIdentity) {
    notes.push("phoneTooShort");
  }

  // Orgs implied by matched contacts.
  const contactOrgIds = new Set(
    contacts.map((c) => c.organizationId).filter((x): x is string => !!x),
  );

  // 2) Spoken org name → ILIKE on legal/display name (trigram-indexed).
  if (extraction.organizationName) {
    const q = extraction.organizationName.replace(/[%,]/g, " ").trim();
    if (q.length >= 2) {
      const { data: orgRows } = await supabase
        .from("organizations")
        .select("id, legal_name, display_name_en, display_name_da")
        .is("deleted_at", null)
        .or(
          `legal_name.ilike.%${q}%,display_name_en.ilike.%${q}%,display_name_da.ilike.%${q}%`,
        )
        .limit(MAX_CANDIDATES);
      for (const o of orgRows ?? []) {
        organizations.push({
          id: o.id,
          name: o.display_name_da || o.display_name_en || o.legal_name,
          via: "name",
        });
      }
    }
  }

  // Fold contact-implied orgs in (fetch their names for display).
  const nameOrgIds = new Set(organizations.map((o) => o.id));
  const missingOrgIds = [...contactOrgIds].filter((id) => !nameOrgIds.has(id));
  if (missingOrgIds.length > 0) {
    const { data: orgRows } = await supabase
      .from("organizations")
      .select("id, legal_name, display_name_en, display_name_da")
      .in("id", missingOrgIds);
    for (const o of orgRows ?? []) {
      organizations.push({
        id: o.id,
        name: o.display_name_da || o.display_name_en || o.legal_name,
        via: "contact",
      });
    }
  }

  // 3) Frame / QR / fleet → bike_identifiers exact.
  const idProbes: { value: string; type: string; via: BikeCandidate["via"] }[] =
    [];
  if (extraction.frameNumber)
    idProbes.push({
      value: extraction.frameNumber.trim(),
      type: FRAME_TYPE,
      via: "frame",
    });
  if (extraction.qrCode)
    idProbes.push({ value: extraction.qrCode.trim(), type: QR_TYPE, via: "qr" });
  if (extraction.fleetNumber)
    idProbes.push({
      value: extraction.fleetNumber.trim(),
      type: FLEET_TYPE,
      via: "fleet",
    });

  const seenBikeIds = new Set<string>();
  for (const probe of idProbes) {
    const { data: idRows } = await supabase
      .from("bike_identifiers")
      .select(
        "identifier_value, bike:bikes!inner(id, frame_number, owner_organization_id, deleted_at)",
      )
      .eq("identifier_type_id", probe.type)
      .eq("identifier_value", probe.value)
      .limit(MAX_CANDIDATES);
    for (const row of idRows ?? []) {
      // PostgREST types the embed as an array; it's a to-one here.
      const bike = (
        Array.isArray(row.bike) ? row.bike[0] : row.bike
      ) as {
        id: string;
        frame_number: string;
        owner_organization_id: string | null;
        deleted_at: string | null;
      } | null;
      if (!bike || bike.deleted_at || seenBikeIds.has(bike.id)) continue;
      seenBikeIds.add(bike.id);
      bikes.push({
        id: bike.id,
        frameNumber: bike.frame_number,
        organizationId: bike.owner_organization_id,
        via: probe.via,
      });
    }
  }

  // 4) Fallback: exactly one org known + no bike yet → that org's fleet,
  // filtered by colour / type hints if given.
  const orgSoFar = soleId(organizations);
  if (orgSoFar && bikes.length === 0) {
    const { data: fleetRows } = await supabase
      .from("bikes")
      .select(
        "id, frame_number, owner_organization_id, color:colors(name_en, name_da), bike_type:bike_types(name_en, name_da)",
      )
      .eq("owner_organization_id", orgSoFar)
      .is("deleted_at", null)
      .limit(200);
    const colorHint = extraction.colorHint?.toLowerCase() ?? null;
    const typeHint = extraction.bikeTypeHint?.toLowerCase() ?? null;
    const hintMatch = (
      embed: { name_en: string | null; name_da: string | null } | null,
      hint: string | null,
    ): boolean => {
      if (!hint) return true; // no hint → doesn't filter
      if (!embed) return false;
      const name = localizedName(locale, embed.name_en, embed.name_da).toLowerCase();
      return name.includes(hint) || hint.includes(name);
    };
    const filtered = (fleetRows ?? []).filter((b) => {
      const color = (Array.isArray(b.color) ? b.color[0] : b.color) ?? null;
      const type = (Array.isArray(b.bike_type) ? b.bike_type[0] : b.bike_type) ?? null;
      return hintMatch(color, colorHint) && hintMatch(type, typeHint);
    });
    // Only useful as a resolver when a hint actually narrowed the fleet.
    if ((colorHint || typeHint) && filtered.length > 0) {
      for (const b of filtered.slice(0, MAX_CANDIDATES)) {
        bikes.push({
          id: b.id,
          frameNumber: b.frame_number,
          organizationId: b.owner_organization_id,
          via: "fleet_filter",
        });
      }
      if (filtered.length > MAX_CANDIDATES) notes.push("fleetTruncated");
    }
  }

  return {
    candidates: {
      organizations: organizations.slice(0, MAX_CANDIDATES),
      contacts: contacts.slice(0, MAX_CANDIDATES),
      bikes: bikes.slice(0, MAX_CANDIDATES),
      notes,
    },
    matchedOrganizationId: soleId(organizations),
    matchedContactId: soleId(contacts),
    matchedBikeId: soleId(bikes),
  };
}
