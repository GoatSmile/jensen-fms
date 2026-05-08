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
