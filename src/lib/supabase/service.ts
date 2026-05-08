import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * Service-role Supabase client. Server-only — never import from a client
 * component or expose the secret key to the browser.
 *
 * Used by privileged server actions (uploads to storage, anything that should
 * bypass RLS once it's enabled). Today the publishable-key client also has
 * full access (RLS is deferred), but routing privileged writes through the
 * secret-key client keeps the boundary explicit so future RLS tightening
 * doesn't silently break uploads.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Service Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
