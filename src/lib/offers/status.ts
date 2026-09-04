/**
 * The offer's lifecycle.
 *
 * Two rules here are decisions, not mechanics, and both are easy to "fix" into
 * something worse:
 *
 * 1. **`expired` is DERIVED, never written.** The enum carries the value and
 *    nothing ever stores it. An offer whose date has passed is shown as expired
 *    and stays perfectly acceptable — a customer who says yes a day late has
 *    said yes, and no clock should refuse him. Same reasoning as "at painter"
 *    and "painted", which are derived rather than bike columns.
 *
 * 2. **A counteroffer REOPENS the offer for revision; it does not edit it.**
 *    Sending freezes the lines. Reopening returns it to `draft` and bumps
 *    `revision`, so the customer is never holding two different documents that
 *    both read OFF-2026-0001 with nothing to tell them apart. Converted offers
 *    cannot reopen: a sales order exists by then, and the change belongs there.
 */

export const OFFER_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** How long an offer stands unless someone picks a date. Deliberately a
 *  constant rather than an `app_settings` knob until the shop wants to argue
 *  about the number — same call as `DEFAULT_PAYMENT_TERMS_DAYS`. */
export const DEFAULT_OFFER_VALIDITY_DAYS = 30;

/** Lines and header are editable only in draft — everything else is a document
 *  someone outside the shop has already read. */
export function isOfferEditable(status: OfferStatus): boolean {
  return status === "draft";
}

/**
 * Reopening is how a counteroffer is answered. Allowed from every state that
 * is not `converted`, including `rejected`: a dead deal revived is the same
 * motion, and Dennis keeps rejected offers on the customer precisely so they
 * can come back.
 */
export function canReopenForRevision(status: OfferStatus): boolean {
  return status !== "converted" && status !== "draft";
}

/** Manual moves the UI offers, beyond send (which the document owns) and
 *  convert (which writes a sales order). */
export function validNextStatuses(status: OfferStatus): OfferStatus[] {
  switch (status) {
    case "draft":
      return ["sent"];
    case "sent":
      return ["accepted", "rejected"];
    case "accepted":
      return ["rejected"];
    case "rejected":
      return ["accepted"];
    default:
      return [];
  }
}

/** Converting is allowed once the customer has actually seen the offer. */
export function canConvertToSalesOrder(status: OfferStatus): boolean {
  return status === "sent" || status === "accepted";
}

/**
 * Expired for DISPLAY: a live offer whose date has passed. An accepted,
 * rejected or converted offer is never "expired" — its story already ended,
 * and showing a second ending would just be noise.
 */
export function isExpired(
  status: OfferStatus,
  expiryDate: string | null,
  today: Date = new Date(),
): boolean {
  if (status !== "sent") return false;
  if (!expiryDate) return false;
  return expiryDate < today.toISOString().slice(0, 10);
}

/** `issued + DEFAULT_OFFER_VALIDITY_DAYS`, as a plain `YYYY-MM-DD`. */
export function defaultExpiryDate(issuedDate: string): string {
  const d = new Date(`${issuedDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DEFAULT_OFFER_VALIDITY_DAYS);
  return d.toISOString().slice(0, 10);
}

/** Badge colour per status. `expired` is here for the DERIVED badge the UI
 *  computes — no row ever stores it. */
export const OFFER_STATUS_VARIANT: Record<
  OfferStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  draft: "outline",
  sent: "secondary",
  accepted: "success",
  rejected: "destructive",
  expired: "warning",
  converted: "default",
};
