/**
 * Can a server on the public internet open this URL?
 *
 * Asked before handing a link to an outside service that will fetch it (the
 * transcription provider pulls audio from a signed storage URL). Against the
 * LOCAL Supabase that link is http://127.0.0.1:54321/… — the provider's
 * servers would open their own loopback — so the caller uploads the bytes
 * instead. Also what the dev banner uses to say LOCAL vs PRODUCTION, so the
 * two can never disagree.
 *
 * Deliberately conservative: anything that does not parse, or whose host is
 * not plainly a public name or public address, is NOT reachable. A false "no"
 * costs one upload; a false "yes" costs a failed transcription — and the
 * transcription caller falls back to uploading on that failure anyway.
 * Hostnames are judged by their text; no DNS lookup (a public name pointing
 * at a private address is the fallback's job, not this function's).
 */
export function isPubliclyReachableUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  // URL keeps IPv6 hosts in brackets and lower-cases names already.
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return false;

  if (host.includes(":")) return isPublicIPv6(host);
  if (/^\d+(\.\d+){3}$/.test(host)) return isPublicIPv4(host);

  // A name. Single-label names (no dot) resolve only on a local network.
  if (!host.includes(".")) return false;
  const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".test"];
  if (host === "localhost" || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return false;
  return true;
}

function isPublicIPv4(host: string): boolean {
  const o = host.split(".").map(Number);
  if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function isPublicIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return false;
  // IPv4-mapped (::ffff:127.0.0.1) — judge the IPv4 inside.
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIPv4(mapped[1]);
  if (/^::ffff:/.test(h)) return false; // hex-form mapped: treat as not public
  const first = parseInt(h.split(":")[0] || "0", 16);
  if (Number.isNaN(first)) return false;
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  return true;
}
