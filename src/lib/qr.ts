import QRCode from "qrcode";

/**
 * Canonical origin we encode into QR codes. Stable across environments so a
 * sticker printed against a local dev server still resolves once deployed.
 * Override per-env via NEXT_PUBLIC_APP_URL (no trailing slash).
 *
 * Stickers are scanned from outside the app — they must encode a public,
 * reachable URL. localhost isn't reachable from a phone, so we always fall
 * back to the production origin even in dev when the env var is unset.
 */
const DEFAULT_ORIGIN = "https://jensen-fms.vercel.app";

export function appOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env && env.length > 0) return env.replace(/\/$/, "");
  return DEFAULT_ORIGIN;
}

/** The short-alias URL printed on a bike sticker. */
export function bikeStickerUrl(bikeId: string): string {
  return `${appOrigin()}/b/${bikeId}`;
}

export type QROptions = {
  /** Target pixel width of the rendered code. Default 512. */
  width?: number;
  /** Quiet-zone margin in QR modules. Default 2 (tight; standard is 4). */
  margin?: number;
  /** Error correction level. Higher tolerates more occlusion. Default 'M'. */
  errorCorrection?: "L" | "M" | "Q" | "H";
};

/**
 * Render a QR code as an SVG string. Server-callable; pure CPU.
 */
export async function qrSvg(value: string, opts: QROptions = {}): Promise<string> {
  return QRCode.toString(value, {
    type: "svg",
    width: opts.width ?? 512,
    margin: opts.margin ?? 2,
    errorCorrectionLevel: opts.errorCorrection ?? "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/**
 * Render a QR code as a base64 data URL (PNG). Useful when an <img> tag
 * needs the bytes inline (e.g. print views with no extra network round
 * trips).
 */
export async function qrPngDataUrl(
  value: string,
  opts: QROptions = {},
): Promise<string> {
  return QRCode.toDataURL(value, {
    width: opts.width ?? 512,
    margin: opts.margin ?? 2,
    errorCorrectionLevel: opts.errorCorrection ?? "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}
