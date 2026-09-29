import { redirect } from "next/navigation";

/** The inbox became Calls (DECISIONS 2026-09-29); old links still land. */
export default async function InboxItemRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/calls/${encodeURIComponent(id)}`);
}
