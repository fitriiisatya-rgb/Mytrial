import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

/**
 * Server Component / Server Action / Route Handler Supabase client.
 * Reads the user's session from cookies so every query runs AS that user
 * — RLS applies exactly as it would in the browser. Never construct a
 * service-role client here by default; that is a separate, explicit
 * opt-in (see lib/supabase/admin.ts, added when Phase 3's importer needs
 * to write import_batches on behalf of a system job).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component with no way to set cookies —
            // safe to ignore as long as middleware.ts is refreshing the
            // session on every request (it is, see middleware.ts).
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // See note above.
          }
        },
      },
    }
  );
}
