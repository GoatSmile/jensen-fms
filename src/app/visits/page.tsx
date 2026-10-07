import { redirect } from "next/navigation";

/**
 * Visits became Calendar (2026-10-01) — it holds deliveries and other entries
 * too. The old address keeps working, filters and all.
 */
export default async function VisitsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") q.set(k, v);
  }
  const qs = q.toString();
  redirect(qs ? `/calendar?${qs}` : "/calendar");
}
