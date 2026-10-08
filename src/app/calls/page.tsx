import { redirect } from "next/navigation";

/**
 * Calls became the lower half of the Inbox (DECISIONS 2026-10-08); old links
 * and bookmarks still land, filters intact. The detail page stays at
 * /calls/<id> — notifications, the command history and "Open" links use it.
 */
export default async function CallsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  redirect(qs.size ? `/inbox?${qs}` : "/inbox");
}
