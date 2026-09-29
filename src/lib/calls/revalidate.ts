import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Refresh every page that shows an inbound row after it changes: the Calls
 * list and detail, and the Commands list and detail (command rows share the
 * table). One helper so no action refreshes the wrong page — the 27 Sep sweep
 * found four that revalidated a list or a retired route instead.
 */
export function revalidateInbound(id?: string): void {
  revalidatePath("/calls");
  revalidatePath("/commands");
  if (id) {
    revalidatePath(`/calls/${id}`);
    revalidatePath(`/commands/${id}`);
  }
}
