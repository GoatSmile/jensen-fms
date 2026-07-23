import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Browser Supabase client for client components.
 *
 * ⚠️ DO NOT IMPORT until M1 RLS tightening lands. This file is intentionally
 * UNUSED (verified: zero importers) and must stay that way for now.
 *
 * RLS is enabled on every table but with a permissive `anon_all` policy
 * (migration 50: USING true / WITH CHECK true), so the publishable/anon key is
 * effectively a full read+write MASTER KEY over the entire database — NOT safe
 * to expose. Because it isn't referenced by any browser-reachable module,
 * Next.js never inlines NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY into the client
 * bundle, so it does not ship to unauthenticated visitors of the public routes
 * (/b, /report). The moment any client component imports this, the master key
 * inlines into public JS app-wide → critical exposure.
 *
 * Do all browser data access through server components / server actions using
 * src/lib/supabase/server.ts. Only start using this client once user-scoped
 * RLS policies (written against role_capabilities) replace anon_all at M1.
 * See docs/STATUS.md "Landmines" and the 2026-07-23 perimeter audit.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
