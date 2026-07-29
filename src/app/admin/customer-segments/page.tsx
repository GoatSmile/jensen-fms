import { redirect } from "next/navigation";

/**
 * Retired /admin/customer-segments — the seven controlled vocabularies now live on one page,
 * `/admin/lists` (18 routes to 1; plan sections 8 and 15, DECISIONS 2026-07-28).
 *
 * A redirect rather than a delete: these may be bookmarked, and a 404 on a route
 * that worked yesterday reads as the app being broken. Cheap to keep.
 */
export default function RetiredCustomerSegmentsPage() {
  redirect("/admin/lists?vocab=segments");
}
