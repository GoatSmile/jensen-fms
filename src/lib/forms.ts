/**
 * Form-input parsing helpers shared by every server action that reads
 * FormData posted from a `"use client"` component.
 *
 * The classic JS gotcha this defends against:
 *   `new FormData().append("k", undefined)`
 * coerces the value to the *literal string* `"undefined"`, not null. Same
 * with `"null"`. Without a guard, that string travels through the action,
 * passes truthiness checks, and lands in the DB. We caught one such row in
 * `bike_templates` and added belt-and-suspenders: forms now coalesce
 * `undefined → ""` before append, AND every action runs values through this
 * helper which treats both empty string and the literal sentinels as null.
 */

export function nullableString(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed === "" || trimmed === "undefined" || trimmed === "null") {
    return null;
  }
  return trimmed;
}

/**
 * Wrapper around `FormData.append` that coalesces `undefined` and `null` to
 * the empty string. Without this, `fd.append(key, undefined)` records the
 * literal text `"undefined"` — which is how the bug above leaked through in
 * the first place.
 */
export function appendField(
  fd: FormData,
  key: string,
  value: string | number | boolean | undefined | null,
): void {
  if (value == null) {
    fd.append(key, "");
    return;
  }
  fd.append(key, typeof value === "string" ? value : String(value));
}

/**
 * Format checks for the two field kinds that used to lean on the browser.
 *
 * `<Input type="email">` and `type="url"` only validate while they are IN the
 * DOM, and a folded `FormSection` unmounts its children — so once the long
 * forms started folding (2026-07-27), an invalid address inside a collapsed
 * section reached the DB unchallenged. Actions must check these themselves.
 *
 * Deliberately loose: shape only, no deliverability theatre. A supplier's
 * `sales@büchel.de` or a customer's intranet host must not be rejected.
 */
export function looksLikeEmail(v: string): boolean {
  // one @, something either side, a dot in the domain, no whitespace
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
}

export function looksLikeUrl(v: string): boolean {
  try {
    const u = new URL(v.includes("://") ? v : `https://${v}`);
    return u.hostname.includes(".") && !/\s/.test(v);
  } catch {
    return false;
  }
}
