import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Browser Supabase client for client components.
 * Uses the publishable (anon) key — safe to expose to the browser.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
