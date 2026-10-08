import "server-only";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Who may see and act on which inbound rows — the ONE rule, read by the Calls
 * list, the detail page and every action (a server action is callable from
 * anywhere, and the pages load rows with the service client, which bypasses
 * RLS; so the check has to live here, not in the route alone).
 *
 *   `inbox`      every line, the main number, and dictated commands (office).
 *   `calls_own`  the calls stamped with the viewer's own person (a technician),
 *                and the notes they said or that are addressed to them.
 *
 * A UX wall like the rest of the capability model, not a security boundary —
 * but a consistent one: a URL guess or a crafted action call gets the same
 * answer as the page.
 */
export type CallsScope = { all: true } | { all: false; personId: string };

export async function readCallsScope(): Promise<CallsScope | null> {
  if (await readHasCapability("inbox")) return { all: true };
  if (await readHasCapability("calls_own")) {
    const personId = await readPersonId();
    return personId ? { all: false, personId } : null;
  }
  return null;
}

export function scopeAllowsRow(
  scope: CallsScope | null,
  row: { kind: string | null; handled_by_person_id: string | null; addressed_to_person_id?: string | null },
): boolean {
  if (!scope) return false;
  if (scope.all) return true;
  if (row.kind === "command") return false;
  return row.handled_by_person_id === scope.personId || row.addressed_to_person_id === scope.personId;
}

/** For actions: may the viewer act on this row? Reads the row fresh. */
/**
 * A request to the assistant (kind='command') is its ASKER's, and the
 * office's: `inbox` sees every one, anyone else only their own. Calls keep
 * `scopeAllowsRow`.
 */
export function mayReadCommand(
  scope: CallsScope | null,
  personId: string | null,
  row: { commanded_by: string | null },
): boolean {
  if (scope?.all) return true;
  return personId !== null && row.commanded_by === personId;
}

export async function canActOnInbound(messageId: string): Promise<boolean> {
  const scope = await readCallsScope();
  if (!scope) return false;
  if (scope.all) return true;
  const { data } = await createServiceClient()
    .from("inbound_messages")
    .select("kind, handled_by_person_id, addressed_to_person_id")
    .eq("id", messageId)
    .maybeSingle();
  return !!data && scopeAllowsRow(scope, data);
}
