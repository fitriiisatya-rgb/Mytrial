import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Service-role client — bypasses RLS. Server-only, and only for jobs that
 * genuinely have no user session to run as (the cron-triggered Google
 * Sheet sync). Never import this from a Client Component or expose the
 * service role key to the browser. A manually-triggered "Sync Now" from
 * the UI should prefer lib/supabase/server.ts's createClient() instead,
 * since the calling finance_manager/super_admin already has insert rights
 * under RLS (0013) — this client exists for the unattended cron path only.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
