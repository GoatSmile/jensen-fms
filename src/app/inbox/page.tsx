import { redirect } from "next/navigation";

/** The inbox became Calls (DECISIONS 2026-09-29); old links still land. */
export default function InboxRedirect() {
  redirect("/calls");
}
