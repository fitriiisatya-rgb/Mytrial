import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Best-effort audit_log write. RLS only grants audit_log INSERT to
 * super_admin/accounting/finance_manager (0008) — management can write
 * entities/outlets/coa/investors directly but was deliberately not given
 * audit-write, so a management mutation's audit insert fails under RLS.
 * That is expected, not a bug we should route around by widening RLS
 * here — so failures here are swallowed rather than surfaced, which
 * would otherwise turn "audit trail incomplete for this role" into "the
 * user's master-data edit itself appears to fail."
 */
export async function logAudit(
  supabase: SupabaseClient<Database>,
  params: {
    userId: string;
    action: string;
    entityTable: string;
    entityId: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }
) {
  // supabase-js resolves { data, error } for a rejected RLS write rather
  // than throwing — checking `error` (not try/catch) is what actually
  // lets us swallow it deliberately instead of letting it look unhandled.
  const { error } = await supabase.from("audit_log").insert({
    user_id: params.userId,
    action: params.action,
    entity_table: params.entityTable,
    entity_id: params.entityId,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
  });
  if (error) {
    console.warn(`audit_log insert skipped (${params.action} on ${params.entityTable}): ${error.message}`);
  }
}
