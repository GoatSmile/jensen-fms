import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Server Supabase client for React Server Components, server actions, and route handlers.
 *
 * Uses the publishable (anon) key + cookie-bound auth context. When auth is
 * wired up later, the cookies adapter below will automatically read/write
 * the Supabase session cookies. Until then, every request is anonymous.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // RSC contexts can't mutate cookies — Next.js will throw. Wrapping in
          // try/catch lets the same factory be used from server components and
          // server actions/route handlers (where cookie writes are allowed).
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // no-op in RSC; middleware/route handlers will refresh the session.
          }
        },
      },
    },
  );
}
