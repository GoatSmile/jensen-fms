/**
 * Forward-geocode a postal address using Nominatim (OpenStreetMap).
 *
 * Why Nominatim:
 *   - Free, no API key, no billing setup
 *   - Excellent Danish coverage (Jensen's customer base is DK-heavy)
 *   - Rate-limited to 1 req/sec — fine for our pattern, where geocoding
 *     fires only when an organisation's address is saved, not on every
 *     page load
 *
 * Usage policy: Nominatim asks for a clear `User-Agent` so they can
 * reach out if a client misbehaves. We set the app name + a contact
 * email pulled from NEXT_PUBLIC_NOMINATIM_CONTACT (falls back to the
 * Jensen ops mailbox). If we ever migrate to a self-hosted Nominatim
 * or a paid geocoder, only this file changes.
 *
 * Caller responsibility: callers must NOT loop this synchronously
 * across many records. Geocoding fires server-side from
 * `save-organization`, one address at a time. Bulk backfills should
 * sleep ≥1.1s between calls.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_CONTACT =
  process.env.NEXT_PUBLIC_NOMINATIM_CONTACT ?? "nt@jensenproduction.dk";
const USER_AGENT = `JensenFMS/0.9 (${DEFAULT_CONTACT})`;

export type GeocodeInput = {
  address_line1: string | null;
  address_line2: string | null;
  zip_code: string | null;
  city: string | null;
  country_code: string | null;
};

export type GeocodeResult =
  | { ok: true; latitude: number; longitude: number; displayName: string }
  | { ok: false; reason: "no_address" | "not_found" | "error"; message?: string };

/** Build the search string Nominatim consumes. Drops blank fields. */
function buildQuery(input: GeocodeInput): string {
  const parts = [
    input.address_line1,
    input.address_line2,
    input.zip_code,
    input.city,
  ]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p && p.length > 0);
  return parts.join(", ");
}

export async function geocodeAddress(
  input: GeocodeInput,
): Promise<GeocodeResult> {
  const q = buildQuery(input);
  if (q.length === 0) {
    return { ok: false, reason: "no_address" };
  }

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
  });
  if (input.country_code && input.country_code.trim().length > 0) {
    // Restrict to the customer's country when known — sharply improves
    // accuracy for Danish addresses like "Hovedgaden 5, 8000" that
    // would otherwise pull a UK match.
    params.set("countrycodes", input.country_code.trim().toLowerCase());
  }

  let res: Response;
  try {
    res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      // Nominatim is generally fast (<1s) but occasionally slow under
      // load — give it 8s before giving up so we don't block the
      // organisation save indefinitely.
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message:
        err instanceof Error ? err.message : "Network error reaching Nominatim",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: "error",
      message: `Nominatim returned ${res.status}`,
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message:
        err instanceof Error
          ? err.message
          : "Could not parse Nominatim response",
    };
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const hit = data[0] as { lat?: string; lon?: string; display_name?: string };
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: "error", message: "Malformed lat/lng" };
  }

  return {
    ok: true,
    latitude: lat,
    longitude: lng,
    displayName: hit.display_name ?? q,
  };
}

/**
 * True when the address fields between two snapshots differ in a way
 * that warrants re-geocoding. Cheap shallow compare — we don't care
 * about whitespace changes.
 */
export function addressChanged(
  prev: GeocodeInput,
  next: GeocodeInput,
): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  return (
    norm(prev.address_line1) !== norm(next.address_line1) ||
    norm(prev.address_line2) !== norm(next.address_line2) ||
    norm(prev.zip_code) !== norm(next.zip_code) ||
    norm(prev.city) !== norm(next.city) ||
    norm(prev.country_code) !== norm(next.country_code)
  );
}
